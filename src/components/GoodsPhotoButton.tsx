import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/ImageLightbox";
import { fetchOrderGoodsPhoto } from "@/lib/api/domain-api";
import { cn } from "@/lib/utils";

/** "Xem ảnh" đơn hàng khách gửi lúc tạo đơn — tải ảnh khi bấm rồi mở lightbox. */
export function GoodsPhotoButton({ orderCode, className }: { orderCode: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    try {
      const image = await fetchOrderGoodsPhoto(orderCode);
      if (!image) {
        toast.error("Đơn không có ảnh");
        return;
      }
      setUrl(image);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được ảnh");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn("h-8 gap-1.5 px-2.5 text-xs", className)}
        disabled={busy}
        onClick={() => void open()}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {busy ? "Đang tải…" : "Xem ảnh"}
      </Button>
      <ImageLightbox
        open={!!url}
        onOpenChange={(o) => {
          if (!o) setUrl(null);
        }}
        urls={url ? [url] : []}
        title={`Ảnh đơn hàng · ${orderCode}`}
      />
    </>
  );
}
