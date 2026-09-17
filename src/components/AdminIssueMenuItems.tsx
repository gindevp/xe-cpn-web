import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AdminMarkIssueDialog } from "@/components/AdminMarkIssueDialog";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import {
  ADMIN_ISSUE_LABEL,
  canAdminMarkIssue,
  encodeIssueReason,
  resolveIssueFromStage,
  type AdminIssueType,
} from "@/lib/order-edit-policy";

/** Chỉ các mục menu — dialog phải mount ngoài RowActionsMenu (tránh unmount khi đóng menu). */
export function AdminIssueMenuItems({
  code,
  onPick,
}: {
  code: string;
  onPick: (type: AdminIssueType) => void;
}) {
  const { session } = useAuth();
  const order = useStore((s) => s.orders.find((o) => o.code === code));
  if (!order || !canAdminMarkIssue(order, session?.role)) return null;

  return (
    <>
      {(["EXCEPTION", "LOST", "DAMAGED"] as AdminIssueType[]).map((t) =>
        canAdminMarkIssue(order, session?.role, t) ? (
          <DropdownMenuItem
            key={t}
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              onPick(t);
            }}
          >
            <AlertTriangle className="mr-2 h-4 w-4" /> Ghi nhận {ADMIN_ISSUE_LABEL[t].toLowerCase()}
          </DropdownMenuItem>
        ) : null,
      )}
    </>
  );
}

/** Dialog + handler — bọc cạnh RowActionsMenu (sibling, không nằm trong menu). */
export function AdminIssueDialogHost({
  code,
  type,
  onOpenChange,
}: {
  code: string;
  type: AdminIssueType | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { session } = useAuth();
  const updateOrder = useStore((s) => s.updateOrder);
  const order = useStore((s) => s.orders.find((o) => o.code === code));

  return (
    <AdminMarkIssueDialog
      open={!!type}
      type={type}
      orderCode={order?.code ?? code}
      onOpenChange={onOpenChange}
      onConfirm={(payload) => {
        if (!order || !canAdminMarkIssue(order, session?.role, payload.type)) return;
        const by = session?.username ?? "admin";
        const at = new Date().toISOString();
        const label = ADMIN_ISSUE_LABEL[payload.type];
        const fromStage = resolveIssueFromStage(order);
        const detail = encodeIssueReason(
          payload.reasonNote.trim() || `AD ghi nhận ${label.toLowerCase()}`,
          fromStage,
        );
        updateOrder(
          order.code,
          {
            issue: {
              type: payload.type,
              reason: detail,
              at,
              by,
              fromStage,
              photos: payload.photos.length ? payload.photos : undefined,
            },
          },
          { eventAction: `ISSUE_${payload.type}`, eventDetail: detail },
        );
        onOpenChange(false);
        toast.success(`Đã ghi nhận ${label.toLowerCase()} · ${order.code}`);
      }}
    />
  );
}

/** Gói sẵn: menu items callback + dialog host cho một mã đơn. */
export function useAdminIssueMenu(code: string): {
  menuItems: ReactNode;
  dialog: ReactNode;
} {
  const [issueType, setIssueType] = useState<AdminIssueType | null>(null);
  return {
    menuItems: <AdminIssueMenuItems code={code} onPick={setIssueType} />,
    dialog: (
      <AdminIssueDialogHost
        code={code}
        type={issueType}
        onOpenChange={(v) => !v && setIssueType(null)}
      />
    ),
  };
}
