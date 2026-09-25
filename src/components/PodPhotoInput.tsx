import { useEffect, useRef, useState } from "react";
import { Camera, ClipboardPaste, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Ảnh POD gửi BE dạng data-URL (LONGTEXT, ≤2M ký tự/ảnh) — nén trước khi lưu. */
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.72;

async function compressToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Không đọc được ảnh"));
      el.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không xử lý được ảnh");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function imageFileFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items?.length) return null;
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** Chụp/chọn ảnh: bấm mở camera (mặc định) hoặc thư viện khi allowGallery. */
export function PodPhotoInput({
  photos,
  onChange,
  max = 3,
  disabled,
  tileClassName,
  allowGallery = false,
  allowPaste = false,
  label = "Chụp ảnh",
}: {
  photos: string[];
  onChange: (next: string[]) => void;
  max?: number;
  disabled?: boolean;
  tileClassName?: string;
  /** true = chọn file/thư viện (desktop AD); false = capture camera (POD mobile). */
  allowGallery?: boolean;
  /** true = Ctrl+V / dán ảnh từ clipboard khi component đang mở. */
  allowPaste?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [busy, setBusy] = useState(false);
  // Khung 16:9 đúng tỉ lệ ảnh camera chụp ra nên xem trước không bị cắt.
  const tile = tileClassName ?? "aspect-video w-28";

  const addImageFile = async (file: File | null | undefined) => {
    if (!file) return;
    const current = photosRef.current;
    if (current.length >= max) {
      toast.error(`Tối đa ${max} ảnh`);
      return;
    }
    setBusy(true);
    try {
      if (!file.type.startsWith("image/")) {
        toast.error("Tệp không phải ảnh");
        return;
      }
      onChange([...current, await compressToDataUrl(file)].slice(0, max));
    } catch (e: any) {
      toast.error(e?.message ?? "Không xử lý được ảnh");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!allowPaste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      // Đang gõ ô chữ ngoài vùng ảnh → không cướp Ctrl+V.
      if (
        active &&
        !rootRef.current?.contains(active) &&
        (tag === "input" || tag === "textarea" || active.isContentEditable)
      ) {
        return;
      }
      const file = imageFileFromClipboard(e);
      if (!file) return;
      e.preventDefault();
      void addImageFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addImageFile dùng photosRef
  }, [allowPaste, disabled, max, onChange]);

  return (
    <div ref={rootRef} className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative">
            <img src={p} alt={`Ảnh ${i + 1}`} className={cn("rounded border object-cover", tile)} />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
              aria-label={`Xóa ảnh ${i + 1}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {photos.length < max && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            onPaste={(e) => {
              if (!allowPaste) return;
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of Array.from(items)) {
                if (item.kind === "file" && item.type.startsWith("image/")) {
                  const file = item.getAsFile();
                  if (file) {
                    e.preventDefault();
                    void addImageFile(file);
                    return;
                  }
                }
              }
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-muted-foreground hover:bg-muted disabled:opacity-50",
              tile,
            )}
            aria-label={label}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : allowPaste ? (
              <ClipboardPaste className="h-5 w-5" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
            <span className="text-[10px]">{busy ? "Đang xử lý" : label}</span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          {...(allowGallery ? {} : { capture: "environment" as const })}
          className="hidden"
          onChange={(e) => void addImageFile(e.target.files?.[0])}
        />
      </div>
      {allowPaste && photos.length < max ? (
        <p className="text-[11px] text-muted-foreground">
          Có thể <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">Ctrl</kbd>+
          <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">V</kbd> để dán ảnh
          (screenshot / clipboard).
        </p>
      ) : null}
    </div>
  );
}
