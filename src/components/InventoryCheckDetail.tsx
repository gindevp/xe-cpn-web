import { useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { ImageLightbox } from "@/components/ImageLightbox";
import { isApiEnabled } from "@/lib/api/client";
import {
  fetchInventoryCheckPhotos,
  fetchInventoryCheckScans,
  fetchInventoryCheckThumbnails,
  type InventoryCheckPhoto,
  type InventoryCheckRow,
  type InventoryOrderScan,
} from "@/lib/api/inventory-check-api";
import { downloadExcelRows } from "@/lib/csv";
import { officeName } from "@/lib/mock-data";
import { packageCode } from "@/lib/package-label";
import { ChevronLeft, Download, Search } from "lucide-react";
import { toast } from "sonner";

type RowStatus = "checked" | "missing" | "extra";

const STATUS_LABEL: Record<RowStatus, string> = {
  checked: "Đã kiểm kê",
  missing: "Thiếu hàng",
  extra: "Kiểm dư",
};

const STATUS_CLASS: Record<RowStatus, string> = {
  checked: "border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  missing: "border-transparent bg-red-50 text-red-600 hover:bg-red-50",
  extra: "border-transparent bg-amber-50 text-amber-700 hover:bg-amber-50",
};

const STATUS_ORDER: Record<RowStatus, number> = { missing: 0, extra: 1, checked: 2 };

type DetailRow = {
  code: string;
  status: RowStatus;
  photoCount: number;
  checker: string;
  checkedAt: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDay(iso)} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateTimeShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${formatDay(iso)}`;
}

/** Mã phiên hiển thị: VP-yyyyMMdd-HHmmss theo giờ hoàn tất. */
function sessionLabel(check: InventoryCheckRow) {
  const d = new Date(check.checkedAt);
  if (Number.isNaN(d.getTime())) return check.officeCode || String(check.id);
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${check.officeCode}-${stamp}`;
}

function scannerLabel(s: InventoryOrderScan | undefined, fallback: string) {
  if (!s?.lastScannedBy) return fallback;
  const name = s.lastScannedByName || s.lastScannedBy;
  return s.lastScannedByCode ? `${s.lastScannedByCode} - ${name}` : name;
}

function buildRows(
  check: InventoryCheckRow,
  scans: Record<string, InventoryOrderScan>,
): DetailRow[] {
  const up = (c: string) => c.trim().toUpperCase();
  const system = new Set(check.systemCodes.map(up));
  const scanned = new Set(check.scannedCodes.map(up));
  const missing = new Set(
    (check.missingCodes.length
      ? check.missingCodes.map(up)
      : [...system].filter((c) => !scanned.has(c))
    ).filter((c) => !scanned.has(c)),
  );
  const sessionChecker = check.checkedByName || check.checkedByUsername || "-";
  const rows: DetailRow[] = [];
  for (const code of scanned) {
    const s = scans[code];
    rows.push({
      code,
      status: system.size > 0 && !system.has(code) ? "extra" : "checked",
      photoCount: s?.count ?? 0,
      checker: scannerLabel(s, sessionChecker),
      checkedAt: s?.lastScannedAt || check.checkedAt,
    });
  }
  for (const code of missing) {
    rows.push({ code, status: "missing", photoCount: 0, checker: "-", checkedAt: check.checkedAt });
  }
  return rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (Date.parse(b.checkedAt) || 0) - (Date.parse(a.checkedAt) || 0) ||
      a.code.localeCompare(b.code),
  );
}

export function InventoryCheckDetail({
  check,
  onBack,
}: {
  check: InventoryCheckRow;
  onBack: () => void;
}) {
  const [scans, setScans] = useState<Record<string, InventoryOrderScan>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | RowStatus>("all");
  const [photoOrder, setPhotoOrder] = useState<string | null>(null);

  useEffect(() => {
    setScans({});
    setThumbs({});
    if (!isApiEnabled()) return;
    let cancelled = false;
    fetchInventoryCheckScans(check.id)
      .then((m) => !cancelled && setScans(m))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [check.id]);

  const allRows = useMemo(() => buildRows(check, scans), [check, scans]);
  const counts = useMemo(() => {
    const c = { checked: 0, missing: 0, extra: 0 };
    for (const r of allRows) c[r.status] += 1;
    return c;
  }, [allRows]);

  const rows = useMemo(() => {
    const kw = q.trim().toUpperCase();
    return allRows.filter(
      (r) => (status === "all" || r.status === status) && (!kw || r.code.includes(kw)),
    );
  }, [allRows, q, status]);
  const { pageRows, pager } = usePagedRows(rows, "kiem-ke-detail");

  const pageKey = pageRows
    .filter((r) => r.photoCount > 0)
    .map((r) => r.code)
    .join(",");
  useEffect(() => {
    if (!pageKey || !isApiEnabled()) return;
    const need = pageKey.split(",").filter((c) => !(c in thumbs));
    if (!need.length) return;
    let cancelled = false;
    fetchInventoryCheckThumbnails(check.id, need)
      .then((m) => {
        if (cancelled) return;
        setThumbs((prev) => {
          const next = { ...prev, ...m };
          for (const c of need) if (!(c in next)) next[c] = "";
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check.id, pageKey]);

  const exportRows = () => {
    if (!rows.length) {
      toast.message("Không có dữ liệu để xuất");
      return;
    }
    downloadExcelRows(
      `kiem-ke-${sessionLabel(check)}`,
      [
        ["Mã đơn", "Trạng thái", "Số ảnh", "Người kiểm kê cuối", "Thời gian kiểm kê"],
        ...rows.map((r) => [
          r.code,
          STATUS_LABEL[r.status],
          r.photoCount,
          r.checker,
          formatDateTime(r.checkedAt),
        ]),
      ],
      "KiemKe",
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="gap-1" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">
          Chi tiết phiên kiểm kê - {sessionLabel(check)}
        </h1>
        <Badge className="border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
          Hoàn tất
        </Badge>
      </div>
      <div className="-mt-2 text-sm text-muted-foreground">
        {officeName(check.officeCode) || check.officeCode} · Người hoàn tất:{" "}
        {check.checkedByName || check.checkedByUsername || "—"} · {formatDateTime(check.checkedAt)}
      </div>

      <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          Tổng đơn đã kiểm:{" "}
          <span className="font-semibold text-primary">{counts.checked + counts.extra} đơn</span>
        </div>
        <div>
          Số đơn chưa kiểm: <span className="font-semibold text-primary">{counts.missing} đơn</span>
        </div>
        <div>
          Số đơn kiểm dư: <span className="font-semibold text-primary">{counts.extra} đơn</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nhập mã đơn"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as "all" | RowStatus)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="checked">Đã kiểm kê</SelectItem>
            <SelectItem value="missing">Thiếu hàng</SelectItem>
            <SelectItem value="extra">Kiểm dư</SelectItem>
          </SelectContent>
        </Select>
        <Button className="gap-1.5 sm:ml-auto" onClick={exportRows}>
          <Download className="h-4 w-4" />
          Tải về danh sách
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState>Không có đơn phù hợp.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50/90 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Mã đơn</th>
                  <th className="w-[180px] px-4 py-3 text-center">Hình ảnh</th>
                  <th className="w-[160px] px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Thông tin kiểm kê</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const thumb = thumbs[r.code];
                  return (
                    <tr key={r.code} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 align-middle">
                        <OrderCodeLink code={r.code} className="font-medium" />
                      </td>
                      <td className="border-x px-4 py-2 text-center align-middle">
                        {r.photoCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => setPhotoOrder(r.code)}
                            title={`Xem ${r.photoCount} ảnh kiện`}
                            className="relative mx-auto block h-14 w-14 overflow-hidden rounded-md border bg-muted hover:border-primary"
                          >
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={`Ảnh ${r.code}`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : null}
                            {r.photoCount > 1 ? (
                              <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] text-white">
                                {r.photoCount}
                              </span>
                            ) : null}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">Không có hình ảnh</span>
                        )}
                      </td>
                      <td className="border-r px-4 py-3 align-middle">
                        <Badge className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 align-middle leading-relaxed">
                        <div>Người kiểm kê cuối: {r.checker}</div>
                        <div>Thời gian kiểm kê: {formatDateTime(r.checkedAt)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination pager={pager} className="px-3 pb-3" />
        </div>
      )}

      <InventoryPhotoDialog
        checkId={check.id}
        checkedAt={check.checkedAt}
        orderCode={photoOrder}
        onClose={() => setPhotoOrder(null)}
      />
    </div>
  );
}

/** Ảnh từng kiện của một đơn chụp lúc quét kiểm kho — bằng chứng đối soát. */
function InventoryPhotoDialog({
  checkId,
  checkedAt,
  orderCode,
  onClose,
}: {
  checkId: number | null;
  checkedAt?: string;
  orderCode: string | null;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<InventoryCheckPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    setPhotos([]);
    setLightboxIndex(null);
    if (checkId == null || !orderCode) return;
    let cancelled = false;
    setLoading(true);
    fetchInventoryCheckPhotos(checkId, orderCode)
      .then((rows) => {
        if (!cancelled) setPhotos(rows);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Không tải được ảnh"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkId, orderCode]);

  const groups = useMemo(() => {
    const m = new Map<number, { photo: InventoryCheckPhoto; index: number }[]>();
    photos.forEach((p, index) => {
      const list = m.get(p.packageSeq) ?? [];
      list.push({ photo: p, index });
      m.set(p.packageSeq, list);
    });
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [photos]);

  return (
    <>
      <Dialog open={!!orderCode} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ảnh kiện đã quét · {orderCode}</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-xs text-muted-foreground">
            Ảnh chụp tự động lúc quét tem kiện khi kiểm kho
            {checkedAt ? ` ngày ${formatDay(checkedAt)}` : ""}. Một kiện quét nhiều lần sẽ có nhiều
            ảnh, sắp theo giờ quét.
          </p>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Đang tải ảnh…</p>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Đơn này không có ảnh.</p>
          ) : (
            <div className="space-y-4">
              {groups.map(([seq, items]) => (
                <div key={seq} className="rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">Kiện {seq}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {packageCode(orderCode ?? "", seq)}
                    </span>
                    {items.length > 1 ? (
                      <Badge variant="secondary" className="font-normal">
                        Quét {items.length} lần
                      </Badge>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {items.map(({ photo, index }) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setLightboxIndex(index)}
                        className="group overflow-hidden rounded-md border text-left hover:border-primary"
                      >
                        <img
                          src={photo.photo}
                          alt={`Kiện ${seq} lúc ${formatDateTimeShort(photo.capturedAt)}`}
                          className="aspect-[4/3] w-full bg-muted object-cover"
                          loading="lazy"
                        />
                        <div className="px-2 py-1 text-[11px] leading-tight text-muted-foreground">
                          <div className="font-medium text-foreground">
                            {formatDateTimeShort(photo.capturedAt)}
                          </div>
                          <div>{photo.capturedBy}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ImageLightbox
        open={lightboxIndex != null}
        onOpenChange={(o) => !o && setLightboxIndex(null)}
        urls={photos.map((p) => p.photo)}
        index={lightboxIndex ?? 0}
        title={
          lightboxIndex != null && photos[lightboxIndex]
            ? `${packageCode(orderCode ?? "", photos[lightboxIndex].packageSeq)} · ${formatDateTimeShort(photos[lightboxIndex].capturedAt)}`
            : undefined
        }
      />
    </>
  );
}
