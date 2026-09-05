import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** URL ảnh thật (data:/http:/blob:) — bỏ placeholder kiểu local-pod-1. */
export function isViewableImageUrl(url: string | undefined | null): boolean {
  const u = (url ?? "").trim();
  if (!u) return false;
  if (u.startsWith("data:image/")) return true;
  if (u.startsWith("blob:")) return true;
  if (/^https?:\/\//i.test(u)) return true;
  if (u.startsWith("/") && /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(u)) return true;
  return false;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  urls: string[];
  /** Index ảnh đang mở trong urls */
  index?: number;
  title?: string;
};

/**
 * Popup xem ảnh phóng to (POD, …) — zoom +/- / reset, chuyển ảnh nếu nhiều tấm.
 */
export function ImageLightbox({ open, onOpenChange, urls, index = 0, title }: Props) {
  const viewable = urls.filter(isViewableImageUrl);
  const [i, setI] = useState(index);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!open) return;
    setI(Math.min(Math.max(0, index), Math.max(0, viewable.length - 1)));
    setZoom(1);
  }, [open, index, viewable.length]);

  const current = viewable[i];
  const canPrev = i > 0;
  const canNext = i < viewable.length - 1;

  const zoomIn = () => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))));
  const zoomReset = () => setZoom(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "!flex max-h-[92vh] w-[min(96vw,960px)] max-w-none flex-col gap-3 overflow-hidden p-4 sm:rounded-lg",
          "[&>button.absolute]:hidden",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex shrink-0 items-center gap-2">
          <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold">
            {title ?? "Xem ảnh"}
            {viewable.length > 1 ? ` (${i + 1}/${viewable.length})` : ""}
          </DialogTitle>
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={zoomOut} title="Thu nhỏ">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={zoomIn} title="Phóng to">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={zoomReset} title="100%">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40">
          {current ? (
            <div className="flex min-h-[50vh] items-center justify-center p-4">
              <img
                src={current}
                alt={title ?? "preview"}
                className="max-h-[70vh] max-w-full origin-center object-contain transition-transform duration-150"
                style={{ transform: `scale(${zoom})` }}
                draggable={false}
              />
            </div>
          ) : (
            <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
              Không có ảnh để xem
            </div>
          )}

          {viewable.length > 1 && (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 shadow"
                disabled={!canPrev}
                onClick={() => {
                  setI((x) => Math.max(0, x - 1));
                  setZoom(1);
                }}
                title="Ảnh trước"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 shadow"
                disabled={!canNext}
                onClick={() => {
                  setI((x) => Math.min(viewable.length - 1, x + 1));
                  setZoom(1);
                }}
                title="Ảnh sau"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>

        {viewable.length > 1 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
            {viewable.map((url, idx) => (
              <button
                key={idx}
                type="button"
                className={cn(
                  "h-14 w-14 shrink-0 overflow-hidden rounded border-2",
                  idx === i ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
                )}
                onClick={() => {
                  setI(idx);
                  setZoom(1);
                }}
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
