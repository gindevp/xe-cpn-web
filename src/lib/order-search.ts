import type { OrderX } from "./store";

/** Normalize phone for substring match (ignore spaces/dashes). */
export function digitsOnly(s?: string | null): string {
  return String(s ?? "").replace(/\D/g, "");
}

/** Keep letters+digits only for fuzzy order-code compare. */
export function alnumOnly(s?: string | null): string {
  return String(s ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLocaleLowerCase("vi-VN");
}

/** True if edit distance ≤ 1 (insert/delete/replace one char). */
function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la > lb) return editDistanceAtMost1(b, a);
  // la <= lb, lb - la is 0 or 1
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (la === lb) {
      i++;
      j++;
    } else {
      j++; // insertion in b
    }
  }
  if (j < lb || i < la) edits++;
  return edits <= 1;
}

/** Mã đơn gần đúng: contains sau chuẩn hóa, hoặc lệch 1 ký tự trên đoạn cùng độ dài. */
export function orderCodeNearMatch(code: string | undefined, raw: string): boolean {
  const c = alnumOnly(code);
  const q = alnumOnly(raw);
  if (!c || q.length < 3) return false;
  if (c.includes(q)) return true;
  if (q.length < 4) return false;
  if (c.length >= q.length) {
    for (let i = 0; i <= c.length - q.length; i++) {
      if (editDistanceAtMost1(c.slice(i, i + q.length), q)) return true;
    }
  }
  if (c.length + 1 === q.length || c.length === q.length + 1) {
    return editDistanceAtMost1(c, q);
  }
  // cửa sổ dài hơn 1 ký tự (thiếu/thừa 1 trong đoạn)
  if (c.length > q.length) {
    for (let i = 0; i <= c.length - (q.length + 1); i++) {
      if (editDistanceAtMost1(c.slice(i, i + q.length + 1), q)) return true;
    }
  }
  return false;
}

/**
 * Match order by mã đơn / draft (gần đúng), SĐT gửi|nhận (kể cả 4 số cuối), tên.
 */
export function orderMatchesQuery(
  o: Pick<
    OrderX,
    "code" | "draftCode" | "receiverName" | "senderName" | "receiverPhone" | "senderPhone"
  >,
  raw: string,
): boolean {
  const q = raw.trim();
  if (!q) return false;
  const qLower = q.toLocaleLowerCase("vi-VN");
  const qDigits = digitsOnly(q);

  if (orderCodeNearMatch(o.code, q) || orderCodeNearMatch(o.draftCode, q)) return true;

  if (o.receiverName?.toLocaleLowerCase("vi-VN").includes(qLower)) return true;
  if (o.senderName?.toLocaleLowerCase("vi-VN").includes(qLower)) return true;

  if (qDigits.length >= 3) {
    const rp = digitsOnly(o.receiverPhone);
    const sp = digitsOnly(o.senderPhone);
    // Query thuần 4 số → khớp 4 số cuối SĐT
    const purePhoneTail = qDigits.length === 4 && digitsOnly(q) === q.trim();
    if (purePhoneTail) {
      return rp.endsWith(qDigits) || sp.endsWith(qDigits);
    }
    if (rp.includes(qDigits) || sp.includes(qDigits)) return true;
  }
  return false;
}

export function rankOrderMatch(
  o: Pick<OrderX, "code" | "draftCode" | "receiverName" | "receiverPhone" | "senderPhone">,
  raw: string,
): number {
  const q = raw.trim();
  const qLower = q.toLocaleLowerCase("vi-VN");
  const qDigits = digitsOnly(q);
  const code = alnumOnly(o.code);
  const draft = alnumOnly(o.draftCode);
  const qCode = alnumOnly(q);

  if (code === qCode || draft === qCode) return 100;
  if (code.startsWith(qCode) || draft.startsWith(qCode)) return 92;
  if (qCode.length >= 3 && (code.includes(qCode) || draft.includes(qCode))) return 88;

  if (qDigits.length === 4) {
    if (digitsOnly(o.receiverPhone).endsWith(qDigits) || digitsOnly(o.senderPhone).endsWith(qDigits)) {
      return 85;
    }
  }
  if (
    qDigits.length >= 3 &&
    (digitsOnly(o.receiverPhone) === qDigits || digitsOnly(o.senderPhone) === qDigits)
  ) {
    return 80;
  }
  if (qDigits.length >= 3 && (digitsOnly(o.receiverPhone).includes(qDigits) || digitsOnly(o.senderPhone).includes(qDigits))) {
    return 75;
  }
  if (o.receiverName?.toLocaleLowerCase("vi-VN") === qLower) return 70;
  if (orderCodeNearMatch(o.code, q) || orderCodeNearMatch(o.draftCode, q)) return 60;
  return 10;
}
