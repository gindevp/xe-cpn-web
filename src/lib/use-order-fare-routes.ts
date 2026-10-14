import { useMemo } from "react";
import { findOfficeByToken, orderReceiverOffice, resolveItineraryFromOffices, type Order } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";

/**
 * Tuyến bảng giá dùng tính cước kiện của đơn.
 * Đơn trung chuyển: 2 tuyến (VP gửi → VP trung chuyển, VP trung chuyển → VP nhận), cước kiện = tổng 2 tuyến.
 */
export function useOrderFareRoutes(
  order: Pick<Order, "route" | "itinerary" | "fromOffice" | "toOffice" | "finalToOffice" | "hubOffice"> | null | undefined,
): string[] {
  const offices = useStore((s) => s.offices);
  const { itineraries } = useBranchItineraryMaster();
  return useMemo(() => {
    const single = [order?.route || order?.itinerary || ""];
    if (!order?.hubOffice?.trim()) return single;
    const from = findOfficeByToken(order.fromOffice, offices);
    const hub = findOfficeByToken(order.hubOffice, offices);
    const to = findOfficeByToken(orderReceiverOffice(order), offices);
    if (!from || !hub || !to) return single;
    const a = resolveItineraryFromOffices(from, hub, itineraries)?.branchName;
    const b = resolveItineraryFromOffices(hub, to, itineraries)?.branchName;
    return a && b ? [a, b] : single;
  }, [order, offices, itineraries]);
}
