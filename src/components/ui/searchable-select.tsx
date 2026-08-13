"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Trigger button classes (match SelectTrigger sizing) */
  className?: string;
  contentClassName?: string;
  /** Allow clearing selection */
  allowClear?: boolean;
  clearLabel?: string;
  id?: string;
};

/**
 * Shared searchable single-select (Popover + Command).
 * Value must be chosen from `options` — typing only filters, does not invent values.
 *
 * Wheel scroll: Dialog's RemoveScroll blocks native wheel on portaled Popover
 * content. We attach a non-passive wheel listener and scroll the list manually.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm kiếm...",
  emptyText = "Không tìm thấy kết quả",
  disabled,
  className,
  contentClassName,
  allowClear,
  clearLabel = "—",
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const selected = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  // Ensure mouse-wheel / trackpad scrolls the option list even when nested in
  // a Radix Dialog (RemoveScroll preventDefault on portaled content).
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

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between px-3 font-normal shadow-sm focus-visible:ring-1 focus-visible:ring-ring",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate text-left">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          // Above Dialog (z-50) so list receives pointer/wheel cleanly
          "z-[100] w-[var(--radix-popover-trigger-width)] overflow-hidden p-0",
          contentClassName,
        )}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
      >
        <Command filter={vnCmdkFilter} shouldFilter className="overflow-hidden">
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList
            ref={listRef}
            className="max-h-60 overflow-y-auto overscroll-contain"
          >
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value="__clear__"
                  keywords={[clearLabel]}
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                >
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
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
