import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/PageBits";
import { useStore } from "@/lib/store";
import { officeName, receiverOfficeName, orderReceiverOffice, type Order } from "@/lib/mock-data";
import { displayOrderNote, orderGoodsLabel, packageLabelCode, packageNameOf, packageRows, packageSeqList } from "@/lib/package-label";
import { orderDueAmount } from "@/lib/finance-debt";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

/** Square label — A6 short side, 105 × 105 mm, one page. */
const SHEET_MM = 105;
/** On-screen only — print stays 105×105 mm. */
const PREVIEW_SCALE = 1.55;

const SHEET_CSS = `
.sheet{
  box-sizing:border-box;
  width:${SHEET_MM}mm;
  height:${SHEET_MM}mm;
  max-width:${SHEET_MM}mm;
  max-height:${SHEET_MM}mm;
  aspect-ratio:1 / 1;
  overflow:hidden;
  background:#fff;
  color:#000;
  border:0.35mm solid #000;
  font-family:"Inter",Arial,Helvetica,sans-serif;
  padding:1.2mm 1.6mm;
  display:flex;
  flex-direction:column;
  line-height:1.08;
}
.row{display:flex;align-items:flex-start;gap:1.2mm;min-width:0}
.grow{flex:1;min-width:0}
.dash{border-top:0.25mm dashed #000;margin:0.45mm 0;flex-shrink:0}
.clamp{
  overflow:hidden;
  word-break:break-word;
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:2;
}
.b{font-weight:800}
.hotline{
  flex:1;
  min-height:8mm;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-end;
  gap:0.6mm;
  font-size:22pt;
  font-weight:800;
  letter-spacing:0.08em;
  color:#c8c8c8;
  line-height:1;
  user-select:none;
}
.hotline img{width:auto;height:auto;max-width:24mm;max-height:24mm;flex:1 1 0;min-height:0;object-fit:contain;margin:auto 0}
img{display:block;max-width:100%}
`;

const PRINT_CSS = `
@page{size:${SHEET_MM}mm ${SHEET_MM}mm;margin:0}
html,body{margin:0!important;padding:0!important;background:#fff}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
${SHEET_CSS}
@media print{
  html,body{width:${SHEET_MM}mm;margin:0;padding:0}
  .sheet{
    page-break-inside:avoid;
    break-inside:avoid;
    page-break-after:always;
    break-after:page;
  }
  .sheet:last-child{
    page-break-after:auto;
    break-after:auto;
  }
}
`;

const VND = new Intl.NumberFormat("vi-VN");

const INTER_HREF = "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=block";

/** Chờ Inter tải xong trong iframe in (tối đa 3 s, lỗi mạng thì in bằng Arial). */
function interReady(doc: Document): Promise<void> {
  const loaded = new Promise<void>((resolve) => {
    const link = doc.getElementById("inter-font") as HTMLLinkElement | null;
    if (!link) return resolve();
    const done = () => {
      void Promise.all(["400", "700", "800"].map((w) => doc.fonts.load(`${w} 10pt Inter`, "ĐÃ THU Cước")))
        .catch(() => undefined)
        .finally(() => resolve());
    };
    if (link.sheet) done();
    else {
      link.onload = done;
      link.onerror = () => resolve();
    }
  });
  return Promise.race([loaded, new Promise<void>((r) => window.setTimeout(r, 3000))]);
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mmToPx(mm: number): number {
  return Math.round((mm / 25.4) * 96);
}

/** QR dự phòng phía dưới (trên hotline) — xám đậm; nhạt hơn thì máy in nhiệt in lấm tấm, khó quét. */
const BACKUP_QR_COLOR = "#707070";

async function qrDataUrl(code: string, dark = "#000000"): Promise<string> {
  try {
    return await QRCode.toDataURL(code, {
      margin: 1,
      width: 400,
      errorCorrectionLevel: "M",
      color: { dark, light: "#ffffff" },
    });
  } catch {
    return "";
  }
}

function useQrImage(code: string | null, dark?: string) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!code) {
      setQr("");
      return;
    }
    let alive = true;
    void qrDataUrl(code, dark).then((url) => alive && setQr(url));
    return () => {
      alive = false;
    };
  }, [code, dark]);
  return qr;
}

/** Tuyến trên tem: tên VP gửi → tên VP nhận (không in mã). */
function routeNamesLabel(order: Order): string {
  const from = officeName(order.fromOffice) || order.fromOffice || "—";
  const to = receiverOfficeName(order) || orderReceiverOffice(order) || "—";
  return `${from} → ${to}`;
}

function formatPrintStamp(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const time = d.toLocaleTimeString("vi-VN", { hour12: false });
  return `${time} ${dd}/${mm}/${yyyy}`;
}

function formatIsoStamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatPrintStamp(d);
}

function sheetHtml(
  order: Order,
  qr: string,
  backupQr: string,
  packageSeq: number | undefined,
  printedAt: Date,
  reprintCount?: number,
) {
  const stamp = formatPrintStamp(printedAt);
  const createdStamp = formatIsoStamp(order.createdAt);
  const reprint =
    reprintCount != null && reprintCount > 0 ? ` · In lại #${reprintCount}` : "";
  const routeLine = routeNamesLabel(order);
  const addr = order.homeDelivery ? (order.address ?? "").trim() : "";
  const cod = Math.max(0, order.codAmount ?? 0);
  const senderNote = displayOrderNote(order.note).trim();
  const shelf = order.shelf != null ? String(order.shelf) : "";
  // Còn cước hoặc COD phải thu người nhận = CHƯA THU kèm cước còn phải thu; ĐÃ THU kèm cước đã thu.
  const fareDue = orderDueAmount(order);
  const collected = fareDue <= 0 && Math.max(0, order.codAmount ?? 0) <= 0;
  const payStatus = collected ? "ĐÃ THU" : "CHƯA THU";
  // Phí thu hộ nằm trong cước đơn: tách riêng, phần cước còn nợ trừ phí thu hộ trước để tổng không cộng trùng.
  const codFeeDue = cod > 0 ? Math.min(Math.max(0, order.codFee ?? 0), fareDue) : 0;
  const fareLine = collected ? Math.max(0, order.paidAmount ?? 0) : fareDue - codFeeDue;
  const totalDue = fareDue + cod;
  const moneyRow = (label: string, amount: number) =>
    `<div style="display:flex;justify-content:space-between;font-size:8.5pt;line-height:1.15"><span>${esc(label)}</span><span class="b">${esc(VND.format(amount))} đ</span></div>`;
  const moneyHtml = collected
    ? fareLine > 0
      ? `<div class="b" style="font-size:10pt;margin-top:0.8mm">Cước: ${esc(VND.format(fareLine))} đ</div>`
      : ""
    : `<div style="margin-top:0.6mm;margin-right:2mm">${[
        fareLine > 0 ? moneyRow("Cước thu người nhận", fareLine) : "",
        cod > 0 ? moneyRow("Thu hộ", cod) : "",
        codFeeDue > 0 ? moneyRow("Phí thu hộ", codFeeDue) : "",
      ].join("")}<div style="display:flex;justify-content:space-between;font-size:10.5pt;font-weight:800;border-top:0.25mm solid #000;margin-top:0.3mm;padding-top:0.2mm"><span>Tổng cần thu</span><span>${esc(VND.format(totalDue))} đ</span></div></div>`;
  const kind = order.homeDelivery ? "GTN" : "CK";
  const isPackage = packageSeq != null && packageSeq >= 1;
  const pkg = isPackage ? packageRows(order)[packageSeq - 1] : undefined;
  const weight = (pkg?.weightKg ?? order.weightKg ?? 1).toFixed(3).replace(/(\.\d*?[1-9])0+$|\.0+$/, (_, kept) => kept ?? ".0");
  const content = isPackage
    ? packageNameOf(order, packageSeq!)
    : orderGoodsLabel(order);
  const titleCode = isPackage ? packageLabelCode(order, packageSeq) : order.code;
  const partnerCode =
    "partnerCode" in order ? String((order as { partnerCode?: string }).partnerCode ?? "") : "";
  const ext = !isPackage ? partnerCode : "";

  return `<div class="sheet">
    <div class="row" style="align-items:stretch">
      <div style="width:19mm;flex-shrink:0">
        <div style="font-size:7.5pt;font-weight:700">X.E VIỆT NAM</div>
        <div class="b" style="font-size:11pt;line-height:1.05">${kind}</div>
      </div>
      <div class="grow" style="border-left:0.25mm dashed #000;padding-left:1.6mm;display:flex;flex-direction:column;justify-content:flex-end">
        <div class="clamp b" style="font-size:16pt;line-height:1.02;max-height:11.6mm">${esc(order.receiverName)}</div>
        ${addr ? `<div class="clamp b" style="font-size:7pt;max-height:5.4mm">${esc(addr)}</div>` : ""}
      </div>
      <div class="b" style="font-size:16pt;line-height:1;white-space:nowrap;margin-right:5mm;align-self:flex-end">${esc(order.receiverPhone ?? "")}</div>
    </div>
    <div class="dash" style="margin-top:0.2mm"></div>
    <div class="row" style="align-items:flex-start;margin-top:0.3mm">
      <div class="b" style="font-size:6pt">${esc(createdStamp)}</div>
      <div class="grow" style="text-align:right;margin-right:5mm">
        <div class="b" style="font-size:9.5pt;letter-spacing:0.02em">${esc(titleCode)}</div>
        ${ext ? `<div style="font-size:6pt;margin-top:0.15mm">EXT: ${esc(ext)}</div>` : ""}
      </div>
    </div>
    <div class="dash"></div>
    <div class="row" style="align-items:baseline;gap:2mm">
      <div class="clamp b grow" style="font-size:9pt;max-height:6.4mm">${esc(routeLine)}</div>
    </div>
    <div class="dash"></div>
    <div class="row" style="align-items:center">
      <div class="grow">
        <div class="b" style="font-size:16pt;letter-spacing:0.3mm;line-height:1">${esc(payStatus)}${
          shelf ? `<span style="font-size:8pt;font-weight:700;margin-left:2mm">Kệ ${esc(shelf)}</span>` : ""
        }</div>
        ${moneyHtml}
      </div>
      ${qr ? `<img src="${qr}" alt="QR" style="width:16mm;height:16mm;flex-shrink:0;margin-right:5mm"/>` : `<div style="width:16mm;height:16mm;flex-shrink:0;margin-right:5mm"></div>`}
    </div>
    <div class="dash"></div>
    <div class="b" style="font-size:7pt">KHÔNG CHO XEM HÀNG, KIỂM TRA KĨ NGOẠI QUAN TRƯỚC KHI NHẬN</div>
    <div class="dash"></div>
    <div class="clamp b" style="font-size:13pt;line-height:1.05;max-height:10.2mm">Nội dung: ${esc(content)}</div>
    <div class="b" style="font-size:6.5pt;margin-top:0.3mm">Cân nặng: ${weight} KG</div>
    ${senderNote ? `<div class="clamp" style="font-size:6.5pt;max-height:5.6mm;margin-top:0.3mm"><span class="b">Ghi chú:</span> ${esc(senderNote)}</div>` : ""}
    <div class="hotline">${backupQr ? `<img src="${backupQr}" alt="QR"/>` : ""}<span>19001155</span></div>
    <div style="padding-top:1mm;border-top:0.25mm dashed #000;display:flex;align-items:flex-end;justify-content:space-between;font-size:6pt;font-weight:700">
      <span>Ký tên</span>
      <span style="font-weight:400">Xác nhận đã nhận hàng nguyên vẹn</span>
      <span style="font-size:5.5pt;font-weight:400;white-space:nowrap">In: ${esc(stamp)}${esc(reprint)}</span>
    </div>
  </div>`;
}

function printSheet(html: string, title: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    toast.error("Không mở được cửa sổ in");
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><link id="inter-font" rel="stylesheet" href="${INTER_HREF}"/><style>${PRINT_CSS}</style></head><body>${html}</body></html>`,
  );
  doc.close();

  const cleanup = () => {
    win.onafterprint = null;
    iframe.remove();
  };
  win.onafterprint = cleanup;
  window.setTimeout(cleanup, 60_000);

  const run = () => {
    win.focus();
    win.print();
  };
  const imgs = Array.from(doc.images);
  Promise.all([
    interReady(doc),
    ...imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  ]).then(() => window.setTimeout(run, 80));
}

/** Ghép mọi tem kiện thành một job in (mỗi kiện 1 trang 105×105). */
async function buildBatchSheetsHtml(
  order: Order,
  seqs: number[],
  printedAt: Date,
  reprintCount?: number,
): Promise<string> {
  const parts: string[] = [];
  for (const seq of seqs) {
    const scan = packageLabelCode(order, seq);
    const qr = await qrDataUrl(scan);
    if (!qr) continue;
    const backupQr = await qrDataUrl(scan, BACKUP_QR_COLOR);
    parts.push(sheetHtml(order, qr, backupQr, seq, printedAt, reprintCount));
  }
  return parts.join("");
}

function SheetPreview({ html, px, scale }: { html: string; px: string; scale: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-sm bg-white shadow-md" style={{ width: px, height: px }}>
      <div
        style={{
          width: `${SHEET_MM}mm`,
          height: `${SHEET_MM}mm`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <style>{SHEET_CSS}</style>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

export function PrintLabelDialog({
  code,
  packageSeq,
  /** In hàng loạt mọi kiện của đơn — một lần in tất cả trang. */
  batchPackages,
  /** Mở dialog là in luôn tất cả kiện (Tạo và in). */
  autoPrint,
  open,
  onOpenChange,
}: {
  code: string | null;
  /** In tem kiện lẻ — mã quét = mã đơn_STT */
  packageSeq?: number | null;
  batchPackages?: boolean;
  autoPrint?: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const orders = useStore((s) => s.orders);
  const logOrderEvent = useStore((s) => s.logOrderEvent);
  const order = code ? orders.find((o) => o.code === code) : null;
  const batchSeqs = useMemo(
    () => (batchPackages && order ? packageSeqList(order) : []),
    [batchPackages, order],
  );
  const batchKey = batchSeqs.join(",");
  /** QR từng kiện cho danh sách xem trước dọc (tạo một lần mỗi khi mở / đổi số kiện). */
  const [batchQrs, setBatchQrs] = useState<Record<number, { qr: string; backup: string }>>({});
  useEffect(() => {
    if (!open || !batchPackages || !order) {
      setBatchQrs({});
      return;
    }
    let alive = true;
    void (async () => {
      const out: Record<number, { qr: string; backup: string }> = {};
      for (const seq of batchSeqs) {
        const scan = packageLabelCode(order, seq);
        out[seq] = { qr: await qrDataUrl(scan), backup: await qrDataUrl(scan, BACKUP_QR_COLOR) };
      }
      if (alive) setBatchQrs(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchPackages, order?.code, batchKey]);

  const activeSeq = !batchPackages && packageSeq != null && packageSeq >= 1 ? packageSeq : null;
  const scanCode =
    order && activeSeq != null && activeSeq >= 1
      ? packageLabelCode(order, activeSeq)
      : order?.code ?? null;
  const isPackageLabel = activeSeq != null && activeSeq >= 1;
  const qr = useQrImage(scanCode);
  const backupQr = useQrImage(scanCode, BACKUP_QR_COLOR);
  /** Preview uses live clock; actual print regenerates stamp at press time. */
  const [previewClock, setPreviewClock] = useState(() => new Date());
  useEffect(() => {
    if (!open) return;
    setPreviewClock(new Date());
    const id = window.setInterval(() => setPreviewClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [open, code, activeSeq]);

  const html = useMemo(
    () =>
      order && qr
        ? sheetHtml(
            order,
            qr,
            backupQr,
            isPackageLabel ? activeSeq! : undefined,
            previewClock,
            undefined,
          )
        : "",
    [order, qr, backupQr, isPackageLabel, activeSeq, previewClock],
  );

  const printOne = (seq: number | null, qrImg: string, backupImg: string) => {
    if (!order || !qrImg) return;
    const printedAt = new Date();
    const reprint =
      order.labelPrintedAt != null ? (order.labelReprintCount ?? 0) + 1 : 0;
    const printHtml = sheetHtml(
      order,
      qrImg,
      backupImg,
      seq != null && seq >= 1 ? seq : undefined,
      printedAt,
      reprint > 0 ? reprint : undefined,
    );
    const pkgLabel = seq != null && seq >= 1 ? packageLabelCode(order, seq) : order.code;
    const label = seq ? `Kiện ${pkgLabel}` : `Hóa đơn ${order.code}`;
    printSheet(printHtml, label);
    const stamp = formatPrintStamp(printedAt);
    const detail =
      seq != null && seq >= 1
        ? `Kiện ${pkgLabel} · ${stamp}${reprint > 0 ? ` · In lại #${reprint}` : ""}`
        : `${stamp}${reprint > 0 ? ` · In lại #${reprint}` : ""}`;
    logOrderEvent(order.code, "PRINT", detail);
    toast.success(`Đang in tem 105×105 mm · ${label}`);
  };
  const doPrint = () => printOne(isPackageLabel ? activeSeq : null, qr, backupQr);

  const [printingAll, setPrintingAll] = useState(false);
  const autoPrintedFor = useRef<string | null>(null);

  const doPrintAllPackages = async () => {
    if (!order || !batchSeqs.length) return;
    setPrintingAll(true);
    try {
      const printedAt = new Date();
      const reprint =
        order.labelPrintedAt != null ? (order.labelReprintCount ?? 0) + 1 : 0;
      const html = await buildBatchSheetsHtml(
        order,
        batchSeqs,
        printedAt,
        reprint > 0 ? reprint : undefined,
      );
      if (!html) {
        toast.error("Không tạo được tem kiện");
        return;
      }
      printSheet(html, `Tem kiện ${order.code} (${batchSeqs.length})`);
      const stamp = formatPrintStamp(printedAt);
      for (const seq of batchSeqs) {
        const pkgLabel = packageLabelCode(order, seq);
        logOrderEvent(
          order.code,
          "PRINT",
          `Kiện ${pkgLabel} · ${stamp}${reprint > 0 ? ` · In lại #${reprint}` : ""} · hàng loạt`,
        );
      }
      toast.success(`Đang in ${batchSeqs.length} tem kiện · ${order.code}`);
    } catch (e: any) {
      toast.error(e?.message || "Không in được hàng loạt");
    } finally {
      setPrintingAll(false);
    }
  };

  /** Tạo và in: mở dialog → in một lần tất cả kiện (không next từng tờ). */
  useEffect(() => {
    if (!open) {
      autoPrintedFor.current = null;
      return;
    }
    if (!autoPrint || !batchPackages || !order || batchSeqs.length < 1) return;
    if (autoPrintedFor.current === order.code) return;
    autoPrintedFor.current = order.code;
    const t = window.setTimeout(() => {
      void doPrintAllPackages();
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoPrint, batchPackages, order?.code, batchSeqs.length]);

  // Callback ref: khung xem trước nằm trong portal của Dialog, mount sau effect của component.
  const [previewBox, previewBoxRef] = useState<HTMLDivElement | null>(null);
  const [previewBoxW, setPreviewBoxW] = useState(0);
  useEffect(() => {
    if (!previewBox) return;
    const update = () => setPreviewBoxW(previewBox.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(previewBox);
    return () => ro.disconnect();
  }, [previewBox]);
  const sheetPx = mmToPx(SHEET_MM);
  const previewScale =
    previewBoxW > 0 ? Math.max(0.5, Math.min(PREVIEW_SCALE, (previewBoxW - 16) / sheetPx)) : PREVIEW_SCALE;
  const previewPx = `${Math.floor(sheetPx * previewScale)}px`;
  const batchTotal = batchSeqs.length;
  const inBatch = batchPackages && batchTotal > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[92vh] sm:w-[min(96vw,740px)] sm:max-w-[740px] sm:rounded-lg">
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 pr-11 text-left sm:border-b-0 sm:px-6 sm:pb-2 sm:pt-6">
          <DialogTitle className="text-base leading-snug sm:text-lg">
            {inBatch
              ? `In tem kiện · ${order?.code ?? ""} (${batchTotal} kiện)`
              : activeSeq
                ? `In tem kiện · ${order ? packageLabelCode(order, activeSeq) : ""}`
                : `In hóa đơn ${order ? `· ${order.code}` : ""}`}
          </DialogTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            <span className="sm:hidden">Tem vuông 105 × 105 mm{inBatch && batchTotal > 1 ? " — cuộn để xem từng kiện" : ""}.</span>
            <span className="hidden sm:inline">
              {inBatch
                ? "Tất cả tem kiện xếp dọc — cuộn để xem. In một lần tất cả (mỗi kiện một trang 105×105 mm) hoặc in lẻ từng tem."
                : "Khổ vuông 105 × 105 mm — 1 trang. Trong hộp thoại in chọn 105×105 mm (hoặc Custom), lề Không."}
            </span>
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-6 sm:py-2">
        {!order ? (
          <EmptyState>Không tìm thấy đơn</EmptyState>
        ) : inBatch ? (
          <div ref={previewBoxRef} className="space-y-4 rounded-md bg-muted/40 p-2 sm:p-5">
            {batchSeqs.map((seq, i) => {
              const imgs = batchQrs[seq];
              return (
                <div key={seq} className="flex flex-col items-center gap-2">
                  <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground" style={{ maxWidth: previewPx }}>
                    <span>
                      <span className="font-mono font-medium text-foreground">{packageLabelCode(order, seq)}</span> ({i + 1}/{batchTotal})
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={batchTotal > 1 ? "h-7 gap-1.5 text-xs" : "hidden"}
                      disabled={!imgs?.qr || printingAll}
                      onClick={() => imgs && printOne(seq, imgs.qr, imgs.backup)}
                    >
                      <Printer className="h-3.5 w-3.5" /> In tem này
                    </Button>
                  </div>
                  <SheetPreview
                    html={imgs?.qr ? sheetHtml(order, imgs.qr, imgs.backup, seq, previewClock) : ""}
                    px={previewPx}
                    scale={previewScale}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div ref={previewBoxRef} className="flex justify-center rounded-md bg-muted/40 p-2 sm:p-5">
            <SheetPreview html={html} px={previewPx} scale={previewScale} />
          </div>
        )}
        </div>

        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:justify-between sm:space-x-0 sm:border-t-0 sm:px-6 sm:pb-6">
          <Button variant="outline" className="h-11 sm:h-10" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            {inBatch ? (
              <>
                <Button
                  type="button"
                  className="col-span-2 h-11 gap-2 sm:h-10"
                  onClick={() => void doPrintAllPackages()}
                  disabled={!order || batchTotal < 1 || printingAll}
                >
                  <Printer className="h-4 w-4" />
                  {printingAll ? "Đang in…" : batchTotal > 1 ? `In tất cả ${batchTotal} kiện` : "In tem"}
                </Button>
              </>
            ) : (
              <Button className="col-span-2 h-11 gap-2 sm:h-10" onClick={doPrint} disabled={!order || !html}>
                <Printer className="h-4 w-4" /> In tem
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
