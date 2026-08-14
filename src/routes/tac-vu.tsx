import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bell, Search } from "lucide-react";
import { ProtectedPage } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { canRead } from "@/lib/rbac";
import { MOBILE_TASK_CARDS } from "@/lib/mobile-tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tac-vu")({
  head: () => ({ meta: [{ title: "Tác vụ — X.E" }] }),
  component: () => (
    <ProtectedPage
      title="Tác vụ"
      screen="tac-vu"
      headerExtra={<TaskHomeHeaderActions />}
      hideGlobalTopBarOnMobile
    >
      <TaskHomePage />
    </ProtectedPage>
  ),
});

const MOCK_NOTIFS = [
  { id: "n1", title: "Đơn đã giao thành công", desc: "POD tại quầy", time: "2 phút" },
  { id: "n2", title: "Chuyến khởi hành", desc: "Có đơn đang trên xe", time: "15 phút" },
];

function TaskHomeHeaderActions() {
  const navigate = useNavigate();
  return (
    <div className="ml-auto flex items-center gap-1.5 md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="relative h-9 w-9 rounded-full"
            aria-label="Thông báo"
          >
            <Bell className="h-4 w-4" />
            {MOCK_NOTIFS.length > 0 && (
              <Badge className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
                {MOCK_NOTIFS.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Thông báo</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MOCK_NOTIFS.map((n) => (
            <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5">
              <div className="text-sm font-medium">{n.title}</div>
              <div className="text-xs text-muted-foreground">{n.desc}</div>
              <div className="text-[10px] text-muted-foreground">{n.time} trước</div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="secondary"
        size="icon"
        className="h-9 w-9 rounded-full"
        aria-label="Tìm kiếm"
        onClick={() => navigate({ to: "/van-don" })}
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}

function TaskHomePage() {
  const { session } = useAuth();
  const cards = MOBILE_TASK_CARDS.filter((c) => canRead(session?.role, c.screen));

  return (
    <div className="mx-auto w-full max-w-lg md:max-w-3xl">
      <p className="mb-4 hidden text-sm text-muted-foreground md:block">
        Lối vào nhanh các thao tác kho / giao nhận (cùng màn hình desktop hiện có).
      </p>
      {cards.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Không có tác vụ nào khả dụng cho vai trò của bạn.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.id}
                to={card.to}
                className={cn(
                  "flex min-h-[132px] flex-col items-center justify-center gap-3 rounded-xl border bg-card p-4 text-center shadow-sm",
                  "transition active:scale-[0.98] hover:bg-muted/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <span className="text-sm font-semibold leading-snug text-foreground">{card.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
