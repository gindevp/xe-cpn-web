import { ApiError } from "./client";

/** BE ném key này khi VP đã dùng hết STT 000–999 trong ngày (OrderCodeGenerator.OVERFLOW_ERROR_KEY). */
const DAILY_OVERFLOW_KEY = "error.orderDailySequenceOverflow";

/** Vượt 1000 đơn/VP/ngày — không phải lỗi, chỉ cần nhân viên xác nhận rồi gửi lại. */
export function isDailyOverflowError(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  const body = (typeof e.body === "object" && e.body ? e.body : {}) as {
    message?: string;
    properties?: { message?: string };
  };
  const key = body.message ?? body.properties?.message ?? "";
  return key === DAILY_OVERFLOW_KEY || e.message === DAILY_OVERFLOW_KEY;
}
