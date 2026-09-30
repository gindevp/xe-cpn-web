import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, isApiEnabled } from "@/lib/api/client";
import { ROLE_LABELS, type Role } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export type StaffCard = {
  username: string;
  staffCode?: string | null;
  displayName?: string | null;
  roleCode?: string | null;
  roleGroupName?: string | null;
  officeCode?: string | null;
  officeName?: string | null;
  allOffices: boolean;
  active: boolean;
};

/** null = đã tra cứu nhưng không có hồ sơ (vd. người nộp nhập tay). */
const cache = new Map<string, Promise<StaffCard | null>>();

function loadStaff(key: string): Promise<StaffCard | null> {
  const k = key.trim().toLowerCase();
  let p = cache.get(k);
  if (!p) {
    p = apiRequest<StaffCard>(`/api/staff-lookup/${encodeURIComponent(k)}`).catch(() => {
      cache.delete(k);
      return null;
    });
    cache.set(k, p);
  }
  return p;
}

const NON_STAFF_KEYS = new Set(["-", "—", "system", "anonymoususer", "customer", "khach", "khách", "chưa xác định"]);

/** Tên / tài khoản / mã nhân viên: rê chuột hoặc bấm để xem đầy đủ thông tin. */
export function StaffInfoPopover({
  staffKey,
  children,
  className,
}: {
  staffKey?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  const raw = staffKey?.trim() ?? "";
  const key = raw && !NON_STAFF_KEYS.has(raw.toLowerCase()) && !/\s/.test(raw) ? raw : "";
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<StaffCard | null | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open || !key || card !== undefined || !isApiEnabled()) return;
    let alive = true;
    void loadStaff(key).then((c) => alive && setCard(c));
    return () => {
      alive = false;
    };
  }, [open, key, card]);

  useEffect(() => {
    setCard(undefined);
  }, [key]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  if (!key || !isApiEnabled()) return <>{children ?? raw}</>;

  const hoverOpen = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const role = card?.roleCode ? ROLE_LABELS[card.roleCode as Role] ?? card.roleCode : undefined;
  const office = card?.allOffices ? "Toàn hệ thống" : card?.officeName || card?.officeCode;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("text-left text-primary underline-offset-2 hover:underline", className)}
          onMouseEnter={hoverOpen}
          onMouseLeave={hoverClose}
        >
          {children ?? raw}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 text-sm"
        side="left"
        align="start"
        sideOffset={8}
        onMouseEnter={hoverOpen}
        onMouseLeave={hoverClose}
      >
        {card === undefined ? (
          <p className="text-muted-foreground">Đang tải thông tin nhân viên…</p>
        ) : card === null ? (
          <p className="text-muted-foreground">Không tìm thấy hồ sơ nhân viên “{key}”.</p>
        ) : (
          <div className="space-y-2">
            <div>
              <div className="font-semibold">{card.displayName?.trim() || card.username}</div>
              <div className="text-xs text-muted-foreground">{card.username}</div>
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Mã nhân viên</dt>
              <dd>{card.staffCode || "—"}</dd>
              <dt className="text-muted-foreground">Vai trò</dt>
              <dd>{role || "—"}</dd>
              <dt className="text-muted-foreground">Chức danh</dt>
              <dd>{card.roleGroupName || "—"}</dd>
              <dt className="text-muted-foreground">Văn phòng</dt>
              <dd>{office || "—"}</dd>
              <dt className="text-muted-foreground">Trạng thái</dt>
              <dd className={card.active ? "text-success" : "text-destructive"}>
                {card.active ? "Đang hoạt động" : "Đã khoá"}
              </dd>
            </dl>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
