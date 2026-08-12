import type { ReactNode } from "react";
import { useStore } from "@/lib/store";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Section({
  title,
  right,
  children,
  className,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {title && (
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
          {right}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3">
      <div className="w-40 shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

export function EmptyState({ children = "Chưa có dữ liệu" }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-md border border-dashed bg-muted/30 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function OfflineBadge() {
  const online = useStore((s) => s.online);
  const queued = useStore((s) => s.offlineQueue.length);
  if (online && queued === 0) return null;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/15 px-2 py-1 text-xs font-medium text-warning-foreground">
      <span className="h-2 w-2 rounded-full bg-warning" />
      {online ? `Đồng bộ ${queued} thao tác…` : `Chế độ offline${queued ? ` · ${queued} chờ` : ""}`}
    </div>
  );
}

