import QRCode from "qrcode";
import { formatDateTime, formatVND, officeName } from "@/lib/mock-data";
import { packageRows } from "@/lib/package-label";
import type { OrderX } from "@/lib/store";

/** Ảnh biên nhận cho khách tự tạo đơn (QR) — vẽ thẳng lên canvas, tải về máy dạng PNG. */
const W = 1080;
const PAD = 56;
const INNER = W - PAD * 2;
const FONT = `"Inter", "Segoe UI", Roboto, Arial, sans-serif`;
const BLUE = "#274EA1";
const MUTED = "#6B7280";
const ORANGE = "#F97316";
const BORDER = "#E5EAF2";

type Op = (ctx: CanvasRenderingContext2D) => void;

class Layout {
  y = PAD;
  ops: Op[] = [];
  constructor(private readonly m: CanvasRenderingContext2D) {}

  private font(size: number, weight: number) {
    return `${weight} ${size}px ${FONT}`;
  }

  /** Cắt dòng theo chiều rộng tối đa. */
  wrap(text: string, size: number, weight: number, maxW: number): string[] {
    this.m.font = this.font(size, weight);
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (this.m.measureText(next).width <= maxW || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  text(text: string, opts: { size: number; weight?: number; color?: string; x?: number; maxW?: number; gap?: number }) {
    const { size, weight = 400, color = "#111827", x = PAD, maxW = INNER, gap = 8 } = opts;
    for (const line of this.wrap(text, size, weight, maxW)) {
      const y = this.y + size;
      this.ops.push((c) => {
        c.font = this.font(size, weight);
        c.fillStyle = color;
        c.textAlign = "left";
        c.fillText(line, x, y);
      });
      this.y += size * 1.3;
    }
    this.y += gap;
  }

  /** Nhãn trái — giá trị phải (giá trị tự xuống dòng nếu dài). */
  row(label: string, value: string, opts: { size?: number; weight?: number; color?: string; x?: number; w?: number } = {}) {
    const { size = 30, weight = 600, color = "#111827", x = PAD + 28, w = INNER - 56 } = opts;
    this.m.font = this.font(size, 400);
    const labelW = this.m.measureText(label).width + 24;
    const lines = this.wrap(value, size, weight, w - labelW);
    const top = this.y;
    this.ops.push((c) => {
      c.font = this.font(size, 400);
      c.fillStyle = MUTED;
      c.textAlign = "left";
      c.fillText(label, x, top + size);
    });
    lines.forEach((line, i) => {
      const y = top + size + i * size * 1.3;
      this.ops.push((c) => {
        c.font = this.font(size, weight);
        c.fillStyle = color;
        c.textAlign = "right";
        c.fillText(line, x + w, y);
      });
    });
    this.y += lines.length * size * 1.3 + 10;
  }

  /** Khung bo góc bao quanh phần vẽ trong fn. */
  box(fn: () => void, fill = "#FFFFFF") {
    const top = this.y;
    const at = this.ops.length;
    this.y += 24;
    fn();
    this.y += 14;
    const h = this.y - top;
    this.ops.splice(at, 0, (c) => {
      c.fillStyle = fill;
      c.strokeStyle = BORDER;
      c.lineWidth = 3;
      c.beginPath();
      if (typeof c.roundRect === "function") c.roundRect(PAD, top, INNER, h, 24);
      else c.rect(PAD, top, INNER, h);
      c.fill();
      c.stroke();
    });
    this.y += 24;
  }

  line() {
    const y = this.y + 4;
    this.ops.push((c) => {
      c.strokeStyle = BORDER;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(PAD + 28, y);
      c.lineTo(W - PAD - 28, y);
      c.stroke();
    });
    this.y += 18;
  }

  image(img: HTMLImageElement, size: number) {
    const top = this.y;
    this.ops.push((c) => c.drawImage(img, (W - size) / 2, top, size, size));
    this.y += size + 8;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderGuestBillPng(order: OrderX, payLabel: string): Promise<Blob> {
  const pkgs = packageRows(order);
  const pickup = order.pickupFee ?? 0;
  const delivery = order.deliveryFee ?? 0;
  const codFee = order.codFee ?? 0;
  const declared = order.declaredFee ?? 0;
  const discount = order.discountAmount ?? 0;
  const goodsFare =
    order.goodsFare != null
      ? Number(order.goodsFare)
      : Math.max(0, (order.fare ?? 0) - pickup - delivery - codFee - declared + discount);
  const unpaid = Math.max(0, (order.fare ?? 0) - (order.paidAmount ?? 0));

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Trình duyệt không hỗ trợ tạo ảnh");
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
  const qrUrl = await QRCode.toDataURL(order.code, { margin: 1, width: 360, errorCorrectionLevel: "M" }).catch(() => "");
  const qr = qrUrl ? await loadImage(qrUrl) : null;

  const L = new Layout(measure);
  L.text("X.E VIỆT NAM", { size: 34, weight: 800, color: BLUE, gap: 2 });
  L.text("Biên nhận đơn hàng", { size: 28, color: MUTED, gap: 20 });

  L.box(() => {
    L.text("Mã đơn", { size: 28, color: MUTED, x: PAD + 28, gap: 2 });
    L.text(order.code, { size: 64, weight: 800, x: PAD + 28, gap: 6 });
    const meta = [formatDateTime(order.createdAt), order.route, order.itinerary].filter(Boolean).join(" · ");
    if (meta) L.text(meta, { size: 26, color: MUTED, x: PAD + 28, maxW: INNER - 56, gap: 10 });
    if (qr) L.image(qr, 300);
    L.text("Đưa mã này cho nhân viên quầy khi gửi hàng", { size: 24, color: MUTED, x: PAD + 28, maxW: INNER - 56, gap: 0 });
  }, "#F8FAFF");

  L.box(() => {
    L.text("Người gửi", { size: 30, weight: 700, color: BLUE, x: PAD + 28, gap: 6 });
    L.row("SĐT", order.senderPhone || "—");
    L.row("Tên", order.senderName || "—");
    L.row("VP gửi", officeName(order.fromOffice) || order.fromOffice || "—");
    if (order.pickupAddress) L.row("Địa chỉ", order.pickupAddress);
  });

  L.box(() => {
    L.text("Người nhận", { size: 30, weight: 700, color: BLUE, x: PAD + 28, gap: 6 });
    L.row("SĐT", order.receiverPhone || "—");
    L.row("Tên", order.receiverName || "—");
    L.row("VP nhận", officeName(order.hubOffice || order.toOffice) || order.toOffice || "—");
    if (order.address) L.row("Địa chỉ", order.address);
  });

  L.box(() => {
    L.text("Hàng hoá", { size: 30, weight: 700, color: BLUE, x: PAD + 28, gap: 6 });
    pkgs.forEach((p, i) => {
      if (i > 0) L.line();
      L.row(`Kiện ${p.seq}`, formatVND(p.fare), { color: ORANGE, weight: 700 });
      L.text(p.label, { size: 26, color: MUTED, x: PAD + 28, maxW: INNER - 56, gap: 2 });
      L.text(`SL: ${p.itemQty}   ·   KL: ${p.weightKg != null ? Number(p.weightKg).toFixed(1) : "—"} kg`, {
        size: 26,
        color: MUTED,
        x: PAD + 28,
        gap: 4,
      });
    });
  });

  L.box(() => {
    L.text("Thanh toán", { size: 30, weight: 700, color: BLUE, x: PAD + 28, gap: 6 });
    L.row("Hình thức", payLabel);
    if ((order.codAmount ?? 0) > 0) L.row("Thu hộ COD", formatVND(order.codAmount ?? 0));
    L.line();
    const fees: [string, number][] = [
      ["Cước hàng", goodsFare],
      ["Cước lấy hàng tận nơi", pickup],
      ["Cước giao hàng tận nơi", delivery],
      ["Phí thu hộ COD", codFee],
      ["Phí khai báo giá trị", declared],
      ["Giảm giá", discount > 0 ? -discount : 0],
    ];
    for (const [label, v] of fees) if (v !== 0 || label === "Cước hàng") L.row(label, formatVND(v), { weight: 500 });
    L.row("Đã thu", formatVND(order.paidAmount ?? 0), { weight: 500 });
    L.line();
    L.row("Tổng cước", formatVND(order.fare ?? 0));
    L.row("Tổng phải thu", formatVND(unpaid), { size: 38, weight: 800, color: ORANGE });
  });

  L.text("Cảm ơn quý khách đã gửi hàng tại X.E Việt Nam · Hotline 1900 1155", {
    size: 24,
    color: MUTED,
    gap: 0,
  });

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.ceil(L.y + PAD);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ tạo ảnh");
  ctx.fillStyle = "#F4F7FB";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const op of L.ops) op(ctx);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không tạo được ảnh"))), "image/png"),
  );
}

export function guestBillFileName(code: string): string {
  return `bien-nhan-${code}.png`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type SaveImageResult = "shared" | "cancelled" | "unsupported";

/**
 * Web không ghi thẳng vào thư viện ảnh được: mở bảng chia sẻ của máy để khách chọn
 * "Lưu hình ảnh" (iOS) / "Lưu vào Ảnh" (Android). Phải gọi ngay trong sự kiện bấm —
 * Safari từ chối share() nếu có await dài trước đó, nên blob cần tạo sẵn.
 */
export async function shareImageToGallery(blob: Blob, fileName: string): Promise<SaveImageResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return "unsupported";
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
    return "unsupported";
  }
  try {
    await navigator.share({ files: [file] });
    return "shared";
  } catch (e) {
    return (e as { name?: string } | null)?.name === "AbortError" ? "cancelled" : "unsupported";
  }
}
