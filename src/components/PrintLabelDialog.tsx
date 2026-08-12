import { useEffect, useRef, useState } from "react";
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
import { OFFICES } from "@/lib/mock-data";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Real CODE128 barcode encoding the order code, rendered as an <img> data URL. */
function Barcode({ value }: { value: string }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, value, {
        format: "CODE128",
        width: 2,
        height: 78,
        displayValue: false,
        margin: 0,
      });
      setSrc(canvas.toDataURL("image/png"));
    } catch {
      setSrc("");
    }
  }, [value]);
  if (!src) return <div style={{ height: 78 }} />;
  return (
    <img src={src} alt={value} style={{ height: 78, width: "100%", display: "block" }} />
  );
}

/** Real QR code encoding the order code. */
function QrBlock({ value }: { value: string }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 0, width: 236, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [value]);
  if (!src) return <div style={{ width: 118, height: 118 }} />;
  return <img src={src} alt={value} style={{ width: 118, height: 118, display: "block" }} />;
}


const L = {
  wrap: {
    width: 620,
    background: "#fff",
    color: "#000",
    border: "1px solid #000",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 12,
  } as React.CSSProperties,
  dash: { borderTop: "2px dashed #000", margin: "8px 0" } as React.CSSProperties,
};

export function PrintLabelDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const orders = useStore((s) => s.orders);
  const order = code ? orders.find((o) => o.code === code) : null;
  const ref = useRef<HTMLDivElement>(null);

  const doPrint = () => {
    const html = ref.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) {
      toast.error("Trình duyệt chặn cửa sổ in");
      return;
    }
    w.document.write(
      `<html><head><title>Tem ${order?.code ?? ""}</title></head><body style="margin:0;padding:12px">${html}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 300);
    toast.success(`Đang in tem đơn ${order?.code ?? ""}`);
  };

  const officeName = (c?: string) =>
    OFFICES.find((o) => o.code === c)?.name ?? c ?? "";
  const mask = (p?: string) =>
    p ? `${"*".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : "";
  const now = order ? new Date(order.createdAt) : new Date();
  const stamp = `${now.toLocaleTimeString("vi-VN", { hour12: false })} ${now
    .toLocaleDateString("vi-VN")
    .replace(/\//g, "/")}`;
  const shelf = order
    ? `${(hash(order.code) % 900) + 100}-C-${String((hash(order.code) % 12) + 1).padStart(2, "0")}-B${(hash(order.code) % 4) + 1}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>In tem vận đơn {order ? `· ${order.code}` : ""}</DialogTitle>
        </DialogHeader>

        {!order ? (
          <EmptyState>Không tìm thấy đơn</EmptyState>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            <div ref={ref} className="flex justify-center">
              <div style={L.wrap}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 130 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>X.E VIỆT NAM</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>
                      {order.homeDelivery ? "GTN" : "CK"}
                    </div>
                  </div>
                  <div style={{ borderLeft: "2px dashed #000", paddingLeft: 10, flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {order.receiverName}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                      {order.address ?? officeName(order.toOffice)}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {mask(order.receiverPhone)}
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <Barcode value={order.code} />
                </div>

                <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{stamp}</div>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{order.code}</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      EXT: {hash(order.code)}
                      {String(hash(order.code + "x")).slice(0, 8)}
                    </div>
                  </div>
                </div>

                <div style={L.dash} />
                <div style={{ fontSize: 17, fontWeight: 700, textTransform: "uppercase" }}>
                  {officeName(order.toOffice)}
                </div>
                <div style={L.dash} />

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 44, fontWeight: 800, letterSpacing: 1 }}>
                    {shelf}
                  </div>
                  <QrBlock value={order.code} />
                </div>

                <div style={L.dash} />
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  Thu: {order.collectForm === "COD" ? mask(String(order.fare)) : "0"}
                </div>
                <div style={L.dash} />
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  CHO XEM HÀNG, KHÔNG CHO THỬ
                </div>
                <div style={L.dash} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  Khối lượng nhận hàng tối đa: {(order.weightKg ?? 1).toFixed(3)}kg (Không
                  nhận hoặc trả lại hàng nếu vượt quá khối lượng cho phép)
                </div>
                <div style={L.dash} />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 11,
                    fontWeight: 700,
                    marginTop: 24,
                  }}
                >
                  <span>Ký tên</span>
                  <span style={{ fontWeight: 400 }}>
                    Xác nhận đã nhận hàng nguyên vẹn
                  </span>
                  <span style={{ fontSize: 15 }}>✕.E VIETNAM</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button className="gap-2" onClick={doPrint} disabled={!order}>
            <Printer className="h-4 w-4" /> In tem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
