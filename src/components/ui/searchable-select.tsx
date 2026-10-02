"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { vnCmdkFilter } from "@/lib/vn-search";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Extra searchable text (e.g. code, alias) */
  keywords?: string;
  disabled?: boolean;
};

export type SearchableSelectProps = {
  value?: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  /** Giữ để tương thích: ô chọn chính là ô tìm, placeholder khi gõ lấy theo nhãn đang chọn. */
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Trigger classes (match SelectTrigger sizing) */
  className?: string;
  contentClassName?: string;
  /** Allow clearing selection */
  allowClear?: boolean;
  clearLabel?: string;
  id?: string;
};

/**
 * Combobox chọn 1 giá trị: bấm vào là gõ tìm luôn (ô chọn và ô tìm là một).
 * Giá trị phải chọn từ `options` — chữ gõ chỉ để lọc.
 *
 * Wheel scroll: Dialog's RemoveScroll blocks native wheel on portaled Popover
 * content. We attach a non-passive wheel listener and scroll the list manually.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Chọn...",
  emptyText = "Không tìm thấy kết quả",
  disabled,
  className,
  contentClassName,
  allowClear,
  clearLabel = "—",
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selected = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      if (el.scrollHeight <= el.clientHeight) return;
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, options.length]);

  const openList = () => {
    if (disabled || open) return;
    setSearch("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  const pick = (v: string) => {
    onValueChange(v);
    close();
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
      inputRef.current?.blur();
    }
  };

  return (
    <Command filter={vnCmdkFilter} shouldFilter className="contents">
      {/* contents: ô nhập vẫn là phần tử layout trực tiếp như nút cũ (w-…, flex-1 của className). */}
      <Popover open={open} onOpenChange={(o) => (o ? openList() : close())} modal={false}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            className={cn(
              "flex h-9 w-full cursor-text items-center rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring",
              disabled && "cursor-not-allowed opacity-50",
              className,
            )}
            onMouseDown={(e) => {
              if (disabled || e.target === inputRef.current) return;
              e.preventDefault();
              inputRef.current?.focus();
              if (open) close();
              else openList();
            }}
          >
            <CommandPrimitive.Input
              ref={inputRef}
              id={id}
              disabled={disabled}
              aria-expanded={open}
              autoComplete="off"
              value={open ? search : (selected?.label ?? "")}
              onValueChange={(v) => {
                setSearch(v);
                if (!open) setOpen(true);
              }}
              placeholder={selected?.label ?? placeholder}
              onFocus={openList}
              onClick={openList}
              onBlur={close}
              onKeyDown={(e) => {
                if (e.key === "Escape" && open) {
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
                  openList();
                }
              }}
              className={cn(
                "min-w-0 flex-1 truncate bg-transparent outline-none disabled:cursor-not-allowed",
                open && selected ? "placeholder:text-foreground/60" : "placeholder:text-muted-foreground",
              )}
            />
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </div>
        </PopoverAnchor>
        <PopoverContent
          className={cn(
            // Above Dialog (z-50) so list receives pointer/wheel cleanly
            "z-[100] w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popper-anchor-width)] overflow-hidden p-0",
            contentClassName,
          )}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          // Giữ focus ở ô nhập khi bấm vào danh sách / thanh cuộn.
          onMouseDown={(e) => e.preventDefault()}
          onWheel={(e) => e.stopPropagation()}
        >
          <CommandList ref={listRef} className="max-h-60 overflow-y-auto overscroll-contain">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem value="__clear__" keywords={[clearLabel]} onSelect={() => pick("")}>
                  <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">{clearLabel}</span>
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  keywords={[opt.label, opt.keywords ?? "", opt.value]}
                  disabled={opt.disabled}
                  onSelect={() => pick(opt.value)}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")}
                  />
                  <span className="whitespace-normal leading-tight">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
