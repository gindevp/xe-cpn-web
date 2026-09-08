import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Trễ khi rời chuột để còn kịp di từ nút sang menu. */
const CLOSE_DELAY_MS = 160;

/** Menu tác vụ "…" của dòng: hover là sổ ra, click/bàn phím vẫn dùng được như cũ. */
export function RowActionsMenu({
  children,
  title = "Tác vụ",
  align = "end",
  contentClassName = "w-48",
  buttonClassName = "h-8 w-8",
}: {
  children: ReactNode;
  title?: string;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  useEffect(() => clearCloseTimer, []);

  const openByHover = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const closeSoon = () => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(v) => {
        clearCloseTimer();
        setOpen(v);
      }}
      // Hover mở menu nên không được khóa tương tác phần còn lại của trang.
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={buttonClassName}
          title={title}
          aria-label={title}
          onMouseEnter={openByHover}
          onMouseLeave={closeSoon}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className={contentClassName}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={closeSoon}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
