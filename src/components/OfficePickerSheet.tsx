import { useMemo, useState } from "react";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { officeOptionValue, officeSelectLabel, type OfficeRec } from "@/lib/mock-data";
import { vnIncludes } from "@/lib/vn-search";
import { cn } from "@/lib/utils";

/**
 * Chọn VP cho khách trên điện thoại: bấm nút → bảng trượt từ dưới lên, dòng to, có địa chỉ.
 * Ô tìm cỡ chữ 16px (iOS không tự phóng to) và không tự bật bàn phím trên màn cảm ứng.
 */
export function OfficePickerSheet({
  value,
  onChange,
  offices,
  title,
  placeholder,
  emptyText = "Không có văn phòng",
  disabled,
  className,
  compareOffices,
}: {
  value: string;
  onChange: (value: string) => void;
  offices: OfficeRec[];
  title: string;
  placeholder: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** Mặc định A → Z. Truyền vào khi màn khách cần ghim một vài VP. */
  compareOffices?: (a: OfficeRec, b: OfficeRec) => number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => [...offices].sort(compareOffices ?? ((a, b) => a.name.localeCompare(b.name, "vi"))),
    [offices, compareOffices],
  );
  const selected = useMemo(
    () => sorted.find((o) => officeOptionValue(o) === value),
    [sorted, value],
  );
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return sorted;
    return sorted.filter((o) => vnIncludes([o.name, o.code, o.address ?? ""].join(" "), q));
  }, [sorted, query]);

  const openSheet = () => {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  };

  const pick = (o: OfficeRec) => {
    onChange(officeOptionValue(o));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate text-base font-medium text-foreground">
                {officeSelectLabel(selected)}
              </span>
              {selected.address ? (
                <span className="block truncate text-xs text-muted-foreground">{selected.address}</span>
              ) : null}
            </>
          ) : (
            <span className="block truncate text-base text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto flex h-[85dvh] max-w-xl flex-col gap-0 rounded-t-2xl p-0"
          onOpenAutoFocus={(e) => {
            if (window.matchMedia?.("(pointer: coarse)").matches) e.preventDefault();
          }}
        >
          <div className="border-b px-4 pb-3 pt-4">
            <SheetTitle className="pr-8 text-base">{title}</SheetTitle>
            <SheetDescription className="sr-only">Chọn văn phòng trong danh sách</SheetDescription>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm tên, mã hoặc địa chỉ VP"
                autoComplete="off"
                enterKeyHint="search"
                className="h-11 w-full rounded-xl bg-[#E9EEF5] pl-9 pr-9 text-base outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-black/5"
                  aria-label="Xoá tìm kiếm"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {query.trim() ? "Không tìm thấy văn phòng phù hợp" : emptyText}
              </p>
            ) : (
              filtered.map((o) => {
                const v = officeOptionValue(o);
                const on = v === value;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => pick(o)}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-primary/10",
                      on ? "bg-primary/10" : "hover:bg-black/5",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px] leading-snug", on ? "font-semibold text-primary" : "font-medium")}>
                        {officeSelectLabel(o)}
                      </span>
                      {o.address ? (
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{o.address}</span>
                      ) : null}
                    </span>
                    {on ? <Check className="h-5 w-5 shrink-0 text-primary" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
