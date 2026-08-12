import { toast } from "sonner";
import { isApiEnabled } from "./client";
import * as domain from "./domain-api";
import type { OrderStatus, TripStatus } from "../mock-data";
import { useStore, type OrderX, type TripX } from "../store";

function tripFromDetail(detail?: string): string | undefined {
  if (!detail) return undefined;
  const m = detail.match(/Trip\s+(\S+)/i);
  return m?.[1];
}

function officeFromDetail(detail?: string): string | undefined {
  if (!detail) return undefined;
  const m = detail.match(/VP\s+(\S+)/i);
  return m?.[1];
}

function auditFail(entityType: string, entityId: string, detail: string) {
  useStore.getState().audit({ action: "API_SYNC_FAIL", entityType, entityId, detail });
}

function toastFail(code: string, action: string, err: unknown) {
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : String(err);
  toast.error(`Đồng bộ BE thất bại: ${code} (${action})`, { description: msg });
}

function restoreOrder(code: string, prev?: OrderX) {
  if (!prev) return;
  useStore.setState((st) => ({
    orders: st.orders.map((x) => (x.code === code ? prev : x)),
  }));
}

function restoreTrip(code: string, prev?: TripX) {
  if (!prev) return;
  useStore.setState((st) => ({
    trips: st.trips.map((x) => (x.code === code ? prev : x)),
  }));
}

function patchBodyFromOrderPatch(patch: Partial<OrderX>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.senderName !== undefined) body.senderName = patch.senderName;
  if (patch.senderPhone !== undefined) body.senderPhone = patch.senderPhone;
  if (patch.receiverName !== undefined) body.receiverName = patch.receiverName;
  if (patch.receiverPhone !== undefined) body.receiverPhone = patch.receiverPhone;
  if (patch.note !== undefined) body.note = patch.note;
  if (patch.pickupAddress !== undefined) body.pickupAddress = patch.pickupAddress;
  if (patch.address !== undefined) body.deliveryAddress = patch.address;
  if (patch.weightKg !== undefined) body.weightKg = patch.weightKg;
  if (patch.quantity !== undefined) body.quantity = patch.quantity;
  if (patch.fare !== undefined) body.fareAmount = patch.fare;
  if (patch.homePickup !== undefined) body.homePickup = patch.homePickup;
  if (patch.homeDelivery !== undefined) body.homeDelivery = patch.homeDelivery;
  if (patch.pickingAt !== undefined) body.pickingAt = patch.pickingAt;
  if (patch.pickedUpAt !== undefined) body.pickedUpAt = patch.pickedUpAt;
  if (patch.pickupStaff !== undefined) body.pickupStaffUsername = patch.pickupStaff;
  if (patch.partnerCode !== undefined) body.partnerCode = patch.partnerCode;
  if (patch.partnerFee !== undefined) body.partnerFeeAmount = patch.partnerFee;
  return body;
}

/** Fire-and-forget BE sync after optimistic local store mutations. */
export function pushOrderTransition(code: string, to: OrderStatus, action: string, detail?: string, prev?: OrderX) {
  if (!isApiEnabled() || !useStore.getState().online) return;
  void (async () => {
    try {
      const a = action.replace(/_REPLAY$/, "");
      if (a === "SCAN_OUT") {
        const trip = tripFromDetail(detail);
        if (trip) await domain.scanOut(trip, code, "ADD");
        else await domain.transitionOrderApi(code, to, action, detail);
      } else if (a === "SCAN_REMOVE") {
        const trip = tripFromDetail(detail);
        if (trip) await domain.scanOut(trip, code, "REMOVE");
        else await domain.transitionOrderApi(code, to, action, detail);
      } else if (a === "SCAN_IN") {
        const officeCode = officeFromDetail(detail) ?? useStore.getState().session?.office;
        await domain.scanIn({ orderCode: code, officeCode });
      } else if (a === "POD" || a === "POD_QUAY" || a === "POD_HOME") {
        const o = useStore.getState().orders.find((x) => x.code === code);
        let photos = domain.compactPodPhotos((o?.podPhotos ?? []).map((p) => p.url));
        if (!photos.length) photos = ["local-pod-1"];
        const lastPay = [...(o?.payments ?? [])].reverse().find((p) => p.kind === "SAU");
        await domain.podOrder(code, {
          channel: a === "POD_QUAY" ? "COUNTER" : "HOME",
          actualRecipientName: o?.receiverActualName || detail?.split(" · ")[0] || o?.receiverName || "N/A",
          actualRecipientPhone: o?.receiverActualPhone,
          photos,
          collectedAmount: lastPay?.amount,
          paymentMethod: lastPay?.method ?? "TM",
        });
      } else if (a === "FAIL" || a === "FAIL_MAX" || a === "PUSH_FAIL_3") {
        if (a !== "FAIL_MAX") {
          await domain.failDelivery(code, detail || action);
        }
      } else if (a === "TAKE_JOB" || a === "PUSH_SHIP") {
        await domain.assignShipper(code, { note: detail });
      } else if (a === "RESTORE") {
        await domain.restoreOrder(code);
      } else {
        await domain.transitionOrderApi(code, to, action, detail);
      }
    } catch (e: any) {
      auditFail("order", code, `${action}: ${e?.message ?? e}`);
      restoreOrder(code, prev);
      toastFail(code, action, e);
    }
  })();
}

export function pushTripTransition(code: string, to: TripStatus, prev?: TripX) {
  if (!isApiEnabled() || !useStore.getState().online) return;
  void (async () => {
    try {
      await domain.transitionTripApi(code, to);
    } catch (e: any) {
      auditFail("trip", code, `${to}: ${e?.message ?? e}`);
      restoreTrip(code, prev);
      toastFail(code, `TRIP_${to}`, e);
    }
  })();
}

/** Sync selected updateOrder patches to BE facades. */
export function pushOrderPatch(code: string, patch: Partial<OrderX>, prev?: OrderX) {
  if (!isApiEnabled() || !useStore.getState().online) return;
  void (async () => {
    try {
      if (patch.returnStage) {
        const stage = patch.returnStage;
        if (
          stage === "RETURN_PENDING" &&
          prev?.status !== "RETURNING" &&
          prev?.status !== "RETURNED"
        ) {
          await domain.returnStart(code, "FE return flow");
        } else if (stage === "RT_DONE") {
          await domain.returnComplete(code);
        } else {
          await domain.returnStage(code, stage);
        }
      }
      if (patch.stage && typeof patch.stage === "string") {
        await domain.forwardStage(code, patch.stage);
      }
      if (patch.issue) {
        if (patch.issue.resolvedAt) {
          await domain.resolveIssue(code, patch.issue.reason);
        } else {
          await domain.openIssue(code, patch.issue.type, patch.issue.reason);
        }
      }
      if (patch.status === "CONFIRMED" && prev?.status === "CANCELLED") {
        await domain.restoreOrder(code);
      }
      if (patch.tripCode && patch.tripCode !== prev?.tripCode) {
        await domain.assignOrderToTrip(code, patch.tripCode);
      }
      if (patch.shelf != null) {
        await domain.scanIn({
          orderCode: code,
          officeCode: useStore.getState().session?.office,
          shelfNumber: patch.shelf,
        });
      }
      if (patch.pickingAt && !prev?.pickingAt && Object.keys(patch).every((k) => k === "pickingAt" || k === "pickupStaff")) {
        await domain.pickupStart(code);
      } else if (patch.pickedUpAt && !prev?.pickedUpAt && Object.keys(patch).length === 1) {
        await domain.warehouseReceive(code);
      } else {
        const body = patchBodyFromOrderPatch(patch);
        if (Object.keys(body).length) {
          await domain.patchOrder(code, body);
        }
      }
    } catch (e: any) {
      auditFail("order", code, `patch: ${e?.message ?? e}`);
      restoreOrder(code, prev);
      toastFail(code, "PATCH", e);
    }
  })();
}

export function pushAdvanceLeg(code: string, prev?: OrderX) {
  if (!isApiEnabled() || !useStore.getState().online) return;
  void (async () => {
    try {
      await domain.advanceLeg(code);
    } catch (e: any) {
      auditFail("order", code, `advance-leg: ${e?.message ?? e}`);
      restoreOrder(code, prev);
      toastFail(code, "ADVANCE_LEG", e);
    }
  })();
}
