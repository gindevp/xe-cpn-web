import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ORDER_ISSUE_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  TRIP_STATUS_LABEL,
  openIssueType,
  type OrderIssueType,
  type OrderStatus,
  type TripStatus,
} from "@/lib/mock-data";
import { orderTabStatusLabel } from "@/lib/customer-track-status";

const ORDER_STYLES: Record<OrderStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground border-transparent",
  CONFIRMED: "bg-info/15 text-info border-info/30",
  WAITING: "bg-warning/20 text-warning-foreground border-warning/40",
  IN_TRANSIT: "bg-info/15 text-info border-info/30",
  AT_DEST: "bg-accent text-accent-foreground border-accent",
  OUT_FOR_DELIVERY: "bg-warning/25 text-warning-foreground border-warning/40",
  DELIVERED: "bg-success/15 text-success border-success/40",
  FAILED_DELIVERY: "bg-destructive/15 text-destructive border-destructive/30",
  CANCELLED: "bg-muted text-muted-foreground border-transparent",
  RETURNING: "bg-warning/20 text-warning-foreground border-warning/40",
  RETURNED: "bg-muted text-muted-foreground border-transparent",
};

const TRIP_STYLES: Record<TripStatus, string> = {
  CREATED: "bg-muted text-muted-foreground border-transparent",
  LOADING: "bg-warning/20 text-warning-foreground border-warning/40",
  DEPARTED: "bg-info/15 text-info border-info/30",
  UNLOADING: "bg-accent text-accent-foreground border-accent",
  CLOSED: "bg-success/15 text-success border-success/40",
  CANCELLED: "bg-destructive/15 text-destructive border-destructive/30",
};

const ISSUE_STYLES: Record<OrderIssueType, string> = {
  EXCEPTION: "bg-orange-100 text-orange-700 border-orange-300",
  LOST: "bg-destructive/15 text-destructive border-destructive/30",
  DAMAGED: "bg-destructive/15 text-destructive border-destructive/30",
  CANCEL_REQUEST: "bg-slate-100 text-slate-700 border-slate-300",
};

export function OrderStatusBadge({
  status,
  issue,
  order,
}: {
  status: OrderStatus;
  issue?: { type: OrderIssueType; resolvedAt?: string } | null;
  /** Có đơn → hiện tên tab vận hành đơn đang ở thay vì trạng thái BE. */
  order?: Parameters<typeof orderTabStatusLabel>[0];
}) {
  const tabLabel = order ? orderTabStatusLabel(order) : null;
  const openIssue = openIssueType(issue);
  if (openIssue) {
    return (
      <Badge
        variant="outline"
        className={cn("font-medium", ISSUE_STYLES[openIssue])}
        title={ORDER_STATUS_LABEL[status]}
      >
        {ORDER_ISSUE_STATUS_LABEL[openIssue]}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("font-medium", ORDER_STYLES[status])}>
      {tabLabel ?? ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TRIP_STYLES[status])}>
      {TRIP_STATUS_LABEL[status]}
    </Badge>
  );
}
