import { useState } from "react";
import { Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { useNavigate } from "@tanstack/react-router";

type Notif = { id: string; title: string; desc: string; time: string };

const MOCK_NOTIFS: Notif[] = [
  { id: "n1", title: "Đơn XE2507001 đã giao thành công", desc: "POD tại quầy · VP Ninh Bình", time: "2 phút" },
  { id: "n2", title: "Chuyến TR-0715-01 khởi hành", desc: "HN → HCM · 12 đơn", time: "15 phút" },
  { id: "n3", title: "Yêu cầu hủy đơn cần duyệt", desc: "XE2507089 · lý do: KH đổi ý", time: "1 giờ" },
];

export function GlobalTopBar() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const onSearch = () => {
    const s = q.trim();
    if (!s) return;
    navigate({ to: "/van-don" });
  };

  return (
    <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="Tìm mã đơn, SĐT, người nhận…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Thông báo">
              <Bell className="h-4 w-4" />
              {MOCK_NOTIFS.length > 0 && (
                <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
                  {MOCK_NOTIFS.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
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
      </div>
    </div>
  );
}
