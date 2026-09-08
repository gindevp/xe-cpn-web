import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
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

/** Chụp/tải ảnh POD thật (thay ảnh placeholder cũ). */
export function PodPhotoInput({
  photos,
  onChange,
  max = 3,
  disabled,
  tileClassName,
}: {
  photos: string[];
  onChange: (next: string[]) => void;
  max?: number;
  disabled?: boolean;
  tileClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const tile = tileClassName ?? "h-20 w-24";

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = max - photos.length;
    if (room <= 0) {
      toast.error(`Tối đa ${max} ảnh`);
      return;
    }
    setBusy(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const next: string[] = [];
      for (const file of picked) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name}: không phải ảnh`);
          continue;
        }
        try {
          next.push(await compressToDataUrl(file));
        } catch (e: any) {
          toast.error(`${file.name}: ${e?.message ?? "không tải được"}`);
        }
      }
      if (next.length) onChange([...photos, ...next].slice(0, max));
      if (files.length > room) toast.info(`Chỉ nhận ${room} ảnh nữa (tối đa ${max})`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <div key={i} className="relative">
          <img src={p} alt={`Ảnh POD ${i + 1}`} className={cn("rounded border object-cover", tile)} />
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
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-muted-foreground hover:bg-muted disabled:opacity-50",
            tile,
          )}
          aria-label="Thêm ảnh POD"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          <span className="text-[10px]">{busy ? "Đang xử lý" : "Tải ảnh"}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void pickFiles(e.target.files)}
      />
    </div>
  );
}
