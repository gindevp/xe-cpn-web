import { useEffect, useMemo, useState } from "react";
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
import { formatVND, officeName, receiverOfficeName, type Order } from "@/lib/mock-data";
import { goodsTypeLabel, packageCode, packageRows } from "@/lib/package-label";
import { realVehiclePlate } from "@/components/AssignVehiclePicker";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
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
  font-family:Arial,Helvetica,sans-serif;
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
img{display:block;max-width:100%}
.barcode-wrap{
  flex-shrink:0;
  line-height:0;
  display:block;
  height:20mm;
  overflow:hidden;
}
.barcode-wrap svg{
  width:100%!important;
  height:20mm!important;
  max-width:100%;
  display:block;
}
.barcode-wrap svg rect{shape-rendering:crispEdges}
`;

const PRINT_CSS = `
@page{size:${SHEET_MM}mm ${SHEET_MM}mm;margin:0}
html,body{margin:0!important;padding:0!important;background:#fff}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
${SHEET_CSS}
@media print{
  html,body{width:${SHEET_MM}mm;height:${SHEET_MM}mm;overflow:hidden}
  .sheet{page-break-inside:avoid;break-inside:avoid;page-break-after:avoid}
}
`;

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function maskPhone(p?: string) {
  if (!p) return "";
  return `${"*".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}`;
}

/** Chiều rộng in thực tế (mm) — full ngang trong khung 105 mm (trừ padding 1.6 mm). */
const BARCODE_PRINT_MM = 101.8;

function mmToPx(mm: number): number {
  return Math.round((mm / 25.4) * 96);
}

const BARCODE_TARGET_PX = mmToPx(BARCODE_PRINT_MM);

/** SVG vector full ngang — vạch cao ~20 mm (x2 so với tem cũ). */
function barcodeSvg(value: string): string {
  const render = (moduleW: number) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      width: moduleW,
      height: 48,
      displayValue: false,
      margin: 2,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return svg;
  };

  let best: SVGSVGElement | null = null;
  let bestW = 0;
  for (let moduleW = 4; moduleW >= 1; moduleW -= 0.05) {
    try {
      const svg = render(moduleW);
      const w = parseFloat(svg.getAttribute("width") || "0");
      if (w <= BARCODE_TARGET_PX && w >= bestW) {
        bestW = w;
        best = svg;
      }
      if (w > BARCODE_TARGET_PX && best) break;
    } catch {
      /* thử module nhỏ hơn */
    }
  }

  const svg = best ?? render(1.5);
  const w = svg.getAttribute("width") || "0";
  const h = svg.getAttribute("height") || "0";
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "none");

  return svg.outerHTML;
}

function useQrImage(code: string | null) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!code) {
      setQr("");
      return;
    }
    let alive = true;
    QRCode.toDataURL(code, { margin: 1, width: 400, errorCorrectionLevel: "M" })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(""));
    return () => {
      alive = false;
    };
  }, [code]);
  return qr;
}

function tripCodeOf(order: Order): string | undefined {
  if (order.tripCode) return order.tripCode;
  const legs = order.legs;
  if (!legs?.length) return undefined;
  const idx = order.currentLegIndex ?? 0;
  return legs[idx]?.tripCode ?? [...legs].reverse().find((l) => l.tripCode)?.tripCode;
}

function sheetHtml(order: Order, barcodeMarkup: string, qr: string, packageSeq?: number, bks?: string) {
  const now = new Date(order.createdAt);
  const stamp = `${now.toLocaleTimeString("vi-VN", { hour12: false })} ${now
    .toLocaleDateString("vi-VN")
    .replace(/\//g, "/")}`;
  const dest = receiverOfficeName(order);
  const addr = order.address ?? dest;
  const shelf = order.shelf != null ? String(order.shelf) : "—";
  const kind = order.homeDelivery ? "GTN" : "CK";
  const isPackage = packageSeq != null && packageSeq >= 1;
  const pkg = isPackage ? packageRows(order)[packageSeq - 1] : undefined;
  const fareAmt = pkg?.fare ?? order.fare ?? 0;
  const weight = (pkg?.weightKg ?? order.weightKg ?? 1).toFixed(3);
  const titleCode = isPackage ? packageCode(order.code, packageSeq) : order.code;
  const partnerCode =
    "partnerCode" in order ? String((order as { partnerCode?: string }).partnerCode ?? "") : "";
  const ext = !isPackage ? partnerCode : "";
  const plate = (bks ?? "").trim() || "—";

  return `<div class="sheet">
    <div class="row">
      <div style="width:19mm;flex-shrink:0">
        <div style="font-size:7.5pt;font-weight:700">X.E VIỆT NAM</div>
        <div class="b" style="font-size:11pt;line-height:1.05">${kind}</div>
      </div>
      <div class="grow" style="border-left:0.25mm dashed #000;padding-left:1.6mm">
        <div class="clamp b" style="font-size:8pt;max-height:6mm">${esc(order.receiverName)}</div>
        <div class="clamp b" style="font-size:7pt;max-height:5.4mm">${esc(addr)}</div>
      </div>
      <div class="b" style="font-size:7.5pt;white-space:nowrap">${esc(maskPhone(order.receiverPhone))}</div>
    </div>
    <div class="barcode-wrap" style="margin:0.4mm -1.6mm 0;width:calc(100% + 3.2mm)">
      ${barcodeMarkup}
    </div>
    <div class="row" style="align-items:flex-start;margin-top:0.3mm">
      <div class="b" style="font-size:6pt">${esc(stamp)}</div>
      <div class="grow" style="text-align:right">
        <div class="b" style="font-size:9.5pt;letter-spacing:0.02em">${esc(titleCode)}</div>
        ${ext ? `<div style="font-size:6pt;margin-top:0.15mm">EXT: ${esc(ext)}</div>` : ""}
      </div>
    </div>
    <div class="dash"></div>
    <div class="row" style="align-items:baseline;gap:2mm">
      <div class="clamp b grow" style="font-size:9pt;text-transform:uppercase;max-height:6.4mm">${esc(dest)}</div>
      <div class="b" style="font-size:8pt;white-space:nowrap">BKS ${esc(plate)}</div>
    </div>
    <div class="dash"></div>
    <div class="row" style="align-items:center">
      <div class="grow b" style="font-size:16pt;letter-spacing:0.3mm;line-height:1">${esc(shelf)}</div>
      ${qr ? `<img src="${qr}" alt="QR" style="width:12mm;height:12mm;flex-shrink:0"/>` : `<div style="width:12mm;height:12mm;flex-shrink:0"></div>`}
    </div>
    <div class="dash"></div>
    <div class="b" style="font-size:9pt">Cước: ${esc(formatVND(fareAmt))}</div>
    <div class="dash"></div>
    <div class="b" style="font-size:8pt">CHO XEM HÀNG, KHÔNG CHO THỬ</div>
    <div class="dash"></div>
    <div class="b" style="font-size:6.5pt">Khối lượng nhận hàng tối đa: ${weight} KG (Không nhận hoặc trả lại hàng nếu vượt quá khối lượng cho phép)</div>
    <div style="margin-top:auto;padding-top:1mm;border-top:0.25mm dashed #000;display:flex;align-items:flex-end;justify-content:space-between;font-size:6pt;font-weight:700">
      <span>Ký tên</span>
      <span style="font-weight:400">Xác nhận đã nhận hàng nguyên vẹn</span>
      <span style="font-size:7.5pt">✕.E VIETNAM</span>
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
    `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${html}</body></html>`,
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
  if (imgs.length === 0 || imgs.every((img) => img.complete)) {
    window.setTimeout(run, 80);
    return;
  }
  Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  ).then(() => window.setTimeout(run, 80));
}

export function PrintLabelDialog({
  code,
  packageSeq,
  open,
  onOpenChange,
}: {
  code: string | null;
  /** In tem kiện lẻ — mã quét = mã đơn_STT */
  packageSeq?: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const orders = useStore((s) => s.orders);
  const trips = useStore((s) => s.trips);
  const order = code ? orders.find((o) => o.code === code) : null;
  const plate = order
    ? realVehiclePlate(trips.find((t) => t.code === tripCodeOf(order))?.bks)
    : "";
  const scanCode =
    order && packageSeq != null && packageSeq >= 1
      ? packageCode(order.code, packageSeq)
      : order?.code ?? null;
  const isPackageLabel = packageSeq != null && packageSeq >= 1;
  const barcodeMarkup = useMemo(() => {
    if (!scanCode) return "";
    try {
      return barcodeSvg(scanCode);
    } catch {
      return "";
    }
  }, [scanCode]);
  const qr = useQrImage(scanCode);
  const html = useMemo(
    () =>
      order && barcodeMarkup
        ? sheetHtml(order, barcodeMarkup, qr, isPackageLabel ? packageSeq! : undefined, plate)
        : "",
    [order, barcodeMarkup, qr, isPackageLabel, packageSeq, plate],
  );

  const doPrint = () => {
    if (!order || !html) return;
    const label = packageSeq ? `Kiện ${packageCode(order.code, packageSeq)}` : `Hóa đơn ${order.code}`;
    printSheet(html, label);
    toast.success(`Đang in tem 105×105 mm · ${label}`);
  };

  const previewPx = `calc(${SHEET_MM}mm * ${PREVIEW_SCALE})`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(92vw,740px)] max-w-[740px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {packageSeq
              ? `In tem kiện · ${order ? packageCode(order.code, packageSeq) : ""}`
              : `In hóa đơn ${order ? `· ${order.code}` : ""}`}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Khổ vuông 105 × 105 mm — 1 trang. Trong hộp thoại in chọn 105×105 mm (hoặc Custom), lề Không.
          </p>
        </DialogHeader>

        {!order ? (
          <EmptyState>Không tìm thấy đơn</EmptyState>
        ) : (
          <div className="flex justify-center rounded-md bg-muted/40 p-5">
            <div
              className="overflow-hidden rounded-sm bg-white shadow-md"
              style={{ width: previewPx, height: previewPx }}
            >
              <div
                style={{
                  width: `${SHEET_MM}mm`,
                  height: `${SHEET_MM}mm`,
                  transform: `scale(${PREVIEW_SCALE})`,
                  transformOrigin: "top left",
                }}
              >
                <style>{SHEET_CSS}</style>
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button className="gap-2" onClick={doPrint} disabled={!order || !html || !barcodeMarkup}>
            <Printer className="h-4 w-4" /> In tem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
