import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Trash2, Plus, Save, User, PackagePlus, MapPin, Truck, Receipt, Route as RouteIcon, Printer } from "lucide-react";
import { AddressPicker } from "@/components/AddressPicker";
import { HomeDeliveryMap } from "@/components/HomeDeliveryMap";
import { toast } from "sonner";
import { useStore, type OrderX } from "@/lib/store";

/** Đơn mới gửi cho store.addOrder — giữ lại để gửi lại y nguyên sau khi nhân viên xác nhận. */
type NewOrderPayload = OrderX;
import {
  OTHER_GOODS,
  goodsGroupSelectOptions,
  isOtherGoodsGroup,
  officeOptionsForPoint,
  officeSelectOption,
  officeOptionValue,
  findOfficeByToken,
  allOfficeSelectOptions,
  formatVND,
  branchesForStaffOffice,
  isHnRegionOffice,
  isHnItinerarySide,
  provinceHintFromItinerarySide,
  provinceHintFromOffice,
  hnRegionOffices,
  canonicalOfficeCode,
  type Order,
} from "@/lib/mock-data";
import { genOrderCode, calcDeclaredValueFee, calcCodFee, computeGoodsLineFare, isValidVNPhone, calcHomeDoorFees } from "@/lib/pricing";
import { MoneyInput } from "@/components/MoneyInput";
import { NameInput } from "@/components/NameInput";
import { PhoneInput } from "@/components/PhoneInput";
import { NumberInput } from "@/components/NumberInput";
import { toUpperName } from "@/lib/vn-name";
import { isValidVietnamTaxCode, normalizeTaxCode } from "@/lib/vn-tax-code";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { embedPackageFares, embedPackageGoods, embedPackageItemQtys, embedPackageWeightsKg, embedWarehouseInSeqs, splitMoney, warehouseInSeqs } from "@/lib/package-label";
import { cn } from "@/lib/utils";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { useAuth } from "@/lib/auth";
import { assignedOfficeCode, resolveViewOffice } from "@/lib/office-scope";

type Item = {
  id: string;
  sl: number;
  /** Nhóm hàng — từ Bảng giá → Giá theo sản phẩm (cột nhóm hàng). */
  group: string;
  /** Tên hàng hóa trong nhóm, hoặc "Khác". */
  kind: string;
  /** Tên hàng tự nhập — chỉ dùng khi nhóm/loại là "Khác". */
  name: string;
  weight: number;
  dai: number;
  rong: number;
  cao: number;
  value: number;
  note: string;
  fare: number;
};

const onlyDigits = (s: string) => s.replace(/[^\d]/g, "");

/** Hình thức thanh toán */
const PAY_METHODS = [
  "Người gửi thanh toán",
  "Người nhận thanh toán",
  "Công nợ",
  "Thu cước 1 phần",
];

/** Giảm giá hệ thống — chỉ khi BE/policy cung cấp (chưa có thì 0) */
function systemDiscount(_subtotal: number) {
  return 0;
}

/** Tên người: chữ hoa, giữ dấu tiếng Việt — xem lib/vn-name. */

/** Đơn gần nhất có SĐT khớp (người gửi hoặc người nhận). */
function latestOrderByPhone(orders: Order[], phone: string, role: "sender" | "receiver"): Order | null {
  const p = onlyDigits(phone);
  if (p.length < 9) return null;
  let best: Order | null = null;
  let bestAt = 0;
  for (const o of orders) {
    const match =
      role === "sender" ? onlyDigits(o.senderPhone ?? "") === p : onlyDigits(o.receiverPhone ?? "") === p;
    if (!match) continue;
    const at = new Date(o.updatedAt ?? o.createdAt).getTime();
    if (at >= bestAt) {
      bestAt = at;
      best = o;
    }
  }
  return best;
}

/**
 * Cước từng kiện = cước dòng (1 dòng = 1 kiện), tổng = cước hàng của đơn.
 * Chỉ chia cước hàng — phí thu hộ COD / tận nơi / khai giá là phí của cả đơn, không rải vào kiện.
 */
function faresPerPackage(items: Item[], goodsFare: number): number[] {
  const n = items.length || 1;
  const goods = items.map((i) => Math.round(Number(i.fare) || 0));
  const goodsSum = goods.reduce((s, v) => s + v, 0);
  const rest = Math.max(0, Math.round(Number(goodsFare) || 0) - goodsSum);
  const restParts = splitMoney(rest, n);
  return goods.map((g, i) => g + (restParts[i] ?? 0));
}

function orderNoteWithPackages(body: string | undefined, items: Item[], goodsFare: number) {
  const qtys = items.map((i) => Math.max(1, Number(i.sl) || 1));
  const weights = items.map((i) => Math.max(0, Number(i.weight) || 0));
  const { goodsKinds, goodsNames } = packagesFromItems(items);
  let note = embedPackageGoods(body, goodsKinds, goodsNames);
  note = embedPackageFares(note, faresPerPackage(items, goodsFare));
  note = embedPackageItemQtys(note, qtys);
  note = embedPackageWeightsKg(note, weights);
  return note;
}

/** Mỗi dòng hàng = 1 kiện; SL = số lượng SP trong kiện (khai báo). */
function packagesFromItems(items: Item[]) {
  const packageCount = Math.max(1, items.length);
  const goodsKinds = items.map((i) => (i.kind ?? "").trim() || "Hàng hoá");
  const goodsNames = items.map((i) => ((i.kind ?? "").trim() === OTHER_GOODS ? (i.name ?? "").trim() : ""));
  return { packageCount, goodsKinds, goodsNames, goodsLabel: goodsKinds.join(", ") };
}

const newItem = (): Item => ({
  id: Math.random().toString(36).slice(2, 9),
  sl: 1,
  group: "",
  kind: "",
  name: "",
  weight: 0,
  dai: 10,
  rong: 10,
  cao: 10,
  value: 0,

  note: "",
  fare: 0,
});

export type TaoDonInitial = {
  code?: string;
  route?: string;
  itinerary?: string;
  senderPhone?: string;
  senderName?: string;
  fromOffice?: string;
  homePickup?: boolean;
  pickupAddr?: string;
  pickupFee?: number;
  receiverPhone?: string;
  receiverName?: string;
  toOffice?: string;
  idNumber?: string;
  homeDeliver?: boolean;
  deliverAddr?: string;
  deliverDate?: string;
  deliverFee?: number;
  items?: Item[];
  orderNote?: string;
  codAmount?: number;
  surchargeExtra?: number;
  /** Phí khai giá đã lưu trên đơn — dùng khi sửa đơn vì giá trị khai báo từng kiện không được lưu lại. */
  declaredFee?: number;
  payMethod?: string;
  prepaid?: number;
  ckSender?: boolean;
  bankName?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
  invoiceRequested?: boolean;
  invoiceTaxCode?: string;
  invoiceCompanyName?: string;
  invoiceEmail?: string;
  invoiceCompanyAddress?: string;
};

export function TaoDonDialog({
  open,
  onOpenChange,
  mode = "create",
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode?: "create" | "edit";
  initial?: TaoDonInitial;
}) {
  const { session } = useAuth();
  const { branchNames, itinerariesForBranchName, branchCodeOf, findItinerary, itineraries } =
    useBranchItineraryMaster();
  const offices = useStore((s) => s.offices);
  const orders = useStore((s) => s.orders);
  const viewOfficeRaw = useStore((s) => s.viewOffice);
  const productPricing = useStore((s) => s.productPricing);
  const doorFees = useStore((s) => s.doorFees);
  const homeDeliveryDefault = useStore((s) => s.surcharges.homeDelivery.amount);

  /** VP đang xem: user bó VP = VP gán; admin = VP chọn trên bộ lọc (ALL = không khóa). */
  const effectiveOfficeCode = useMemo(() => {
    const view = resolveViewOffice(session, viewOfficeRaw);
    const raw = assignedOfficeCode(view);
    return canonicalOfficeCode(raw) || raw;
  }, [session, viewOfficeRaw]);
  const effectiveOffice = useMemo(
    () => offices.find((o) => o.code === effectiveOfficeCode || o.name === effectiveOfficeCode),
    [offices, effectiveOfficeCode],
  );
  const effectiveIsHn = Boolean(effectiveOffice && isHnRegionOffice(effectiveOffice));

  const allowedBranchNames = useMemo(() => {
    if (!effectiveOfficeCode || effectiveIsHn) return branchNames;
    return branchesForStaffOffice(branchNames, effectiveOfficeCode, offices, itineraries);
  }, [effectiveOfficeCode, effectiveIsHn, branchNames, offices, itineraries]);

  /** Sửa đơn: chỉ sửa phần đơn hàng, thông tin người gửi / người nhận chỉ xem. */
  const partyLocked = mode === "edit";
  const lockedInputClass = partyLocked ? "bg-muted text-muted-foreground" : undefined;

  /** Nhóm hàng từ Bảng giá → Giá theo sản phẩm; "Khác" để tự nhập tên. */
  const goodsGroupOptions = useMemo(() => goodsGroupSelectOptions(productPricing), [productPricing]);

  const productNameOptions = (group: string) => {
    if (!group || isOtherGoodsGroup(group)) return [];
    const names = [
      ...new Set(
        productPricing
          .filter((p) => p.group.trim() === group)
          .map((p) => p.name.trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "vi"));
    return names.map((n) => ({ value: n, label: n }));
  };

  /** Suy nhóm từ tên SP khi sửa đơn cũ chưa có group. */
  const resolveGroup = (it: Item) => {
    const group = (it.group ?? "").trim();
    if (group) return group;
    const kind = (it.kind ?? "").trim();
    if (isOtherGoodsGroup(kind)) return OTHER_GOODS;
    const hit = productPricing.find((p) => p.name.trim().toLowerCase() === kind.toLowerCase());
    return hit?.group.trim() ?? "";
  };
  const defaultBranch = initial?.route ?? allowedBranchNames[0] ?? "";
  const [route, setRoute] = useState<string>(defaultBranch);
  const [itinerary, setItinerary] = useState<string>(
    initial?.itinerary ?? "",
  );
  // Sender
  const [senderPhone, setSenderPhone] = useState(initial?.senderPhone ?? "");
  const [senderName, setSenderName] = useState(toUpperName(initial?.senderName ?? ""));
  const [fromOffice, setFromOffice] = useState(initial?.fromOffice ?? "");
  const [homePickup, setHomePickup] = useState(initial?.homePickup ?? false);
  const [pickupAddr, setPickupAddr] = useState(initial?.pickupAddr ?? "");
  const [pickupFee, setPickupFee] = useState(initial?.pickupFee ?? 0);
  const [pickupKm, setPickupKm] = useState<number | null>(null);
  // Receiver
  const [receiverPhone, setReceiverPhone] = useState(initial?.receiverPhone ?? "");
  const [receiverName, setReceiverName] = useState(toUpperName(initial?.receiverName ?? ""));
  const [toOffice, setToOffice] = useState(initial?.toOffice ?? "");
  const [idNumber, setIdNumber] = useState(initial?.idNumber ?? "");
  const [homeDeliver, setHomeDeliver] = useState(initial?.homeDeliver ?? false);
  const [deliverAddr, setDeliverAddr] = useState(initial?.deliverAddr ?? "");
  const [deliverDate, setDeliverDate] = useState(initial?.deliverDate ?? "");
  const [deliverFee, setDeliverFee] = useState(initial?.deliverFee ?? 0);
  const [deliverKm, setDeliverKm] = useState<number | null>(null);
  // Items
  const [items, setItems] = useState<Item[]>(() =>
    (initial?.items?.length ? initial.items : [newItem()]).map((it) => ({
      ...newItem(),
      ...it,
      group: it.group ?? "",
      kind: it.kind ?? "",
      name: it.name ?? "",
    })),
  );
  // Payment
  const [orderNote, setOrderNote] = useState(initial?.orderNote ?? "");
  const [codAmount, setCodAmount] = useState(initial?.codAmount ?? 0);
  const [ckSender, setCkSender] = useState(initial?.ckSender ?? false);
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [bankAccountNo, setBankAccountNo] = useState(initial?.bankAccountNo ?? "");
  const [bankAccountName, setBankAccountName] = useState(initial?.bankAccountName ?? "");
  const [invoiceRequested, setInvoiceRequested] = useState(initial?.invoiceRequested ?? false);
  const [invoiceTaxCode, setInvoiceTaxCode] = useState(initial?.invoiceTaxCode ?? "");
  const [invoiceCompanyName, setInvoiceCompanyName] = useState(initial?.invoiceCompanyName ?? "");
  const [invoiceEmail, setInvoiceEmail] = useState(initial?.invoiceEmail ?? "");
  const [invoiceCompanyAddress, setInvoiceCompanyAddress] = useState(initial?.invoiceCompanyAddress ?? "");
  const [surchargeExtra, setSurchargeExtra] = useState(initial?.surchargeExtra ?? 0);
  const [prepaid, setPrepaid] = useState(initial?.prepaid ?? 0);
  const [payMethod, setPayMethod] = useState(initial?.payMethod ?? PAY_METHODS[0]);

  const senderAutofillPhone = useRef("");
  const receiverAutofillPhone = useRef("");

  // When reopening in edit mode with different initial, resync fields.
  useEffect(() => {
    if (!open || !initial) return;
    const br = initial.route ?? allowedBranchNames[0] ?? "";
    setRoute(br);
    setItinerary(initial.itinerary ?? itinerariesForBranchName(br)[0] ?? "");
    setSenderPhone(initial.senderPhone ?? "");
    setSenderName(toUpperName(initial.senderName ?? ""));
    const fromRec = findOfficeByToken(initial.fromOffice, offices);
    const toRec = findOfficeByToken(initial.toOffice, offices);
    setFromOffice(fromRec ? officeOptionValue(fromRec) : (initial.fromOffice ?? ""));
    setHomePickup(initial.homePickup ?? false);
    setPickupAddr(initial.pickupAddr ?? "");
    setPickupFee(initial.pickupFee ?? 0);
    setReceiverPhone(initial.receiverPhone ?? "");
    setReceiverName(toUpperName(initial.receiverName ?? ""));
    setToOffice(toRec ? officeOptionValue(toRec) : (initial.toOffice ?? ""));
    setIdNumber(initial.idNumber ?? "");
    setHomeDeliver(initial.homeDeliver ?? false);
    setDeliverAddr(initial.deliverAddr ?? "");
    setDeliverDate(initial.deliverDate ?? "");
    setDeliverFee(initial.deliverFee ?? 0);
    setItems(
      (initial.items?.length ? initial.items : [newItem()]).map((it) => ({
        ...newItem(),
        ...it,
        group: it.group ?? "",
        kind: it.kind ?? "",
        name: it.name ?? "",
      })),
    );
    setOrderNote(initial.orderNote ?? "");
    setCodAmount(initial.codAmount ?? 0);
    setCkSender(initial.ckSender ?? false);
    setBankName(initial.bankName ?? "");
    setBankAccountNo(initial.bankAccountNo ?? "");
    setBankAccountName(initial.bankAccountName ?? "");
    setInvoiceRequested(initial.invoiceRequested ?? false);
    setInvoiceTaxCode(initial.invoiceTaxCode ?? "");
    setInvoiceCompanyName(initial.invoiceCompanyName ?? "");
    setInvoiceEmail(initial.invoiceEmail ?? "");
    setInvoiceCompanyAddress(initial.invoiceCompanyAddress ?? "");
    setSurchargeExtra(initial.surchargeExtra ?? 0);
    setPrepaid(initial.prepaid ?? 0);
    setPayMethod(initial.payMethod ?? PAY_METHODS[0]);
    senderAutofillPhone.current = "";
    receiverAutofillPhone.current = "";
  }, [open, initial, allowedBranchNames, itinerariesForBranchName, offices]);

  useEffect(() => {
    if (!open) {
      senderAutofillPhone.current = "";
      receiverAutofillPhone.current = "";
    }
  }, [open]);

  // Autofill tên + địa chỉ từ đơn gần nhất khi nhập lại SĐT khách.
  useEffect(() => {
    if (!open || mode === "edit") return;
    const phone = onlyDigits(senderPhone);
    if (phone.length < 9) {
      senderAutofillPhone.current = "";
      return;
    }
    if (senderAutofillPhone.current === phone) return;
    const prev = latestOrderByPhone(orders, phone, "sender");
    if (!prev) return;
    senderAutofillPhone.current = phone;
    if (prev.senderName) setSenderName(toUpperName(prev.senderName));
    if (prev.pickupAddress) {
      setPickupAddr(prev.pickupAddress);
      if (prev.homePickup) setHomePickup(true);
    }
  }, [senderPhone, open, mode, orders]);

  useEffect(() => {
    if (!open || mode === "edit") return;
    const phone = onlyDigits(receiverPhone);
    if (phone.length < 9) {
      receiverAutofillPhone.current = "";
      return;
    }
    if (receiverAutofillPhone.current === phone) return;
    const prev = latestOrderByPhone(orders, phone, "receiver");
    if (!prev) return;
    receiverAutofillPhone.current = phone;
    if (prev.receiverName) setReceiverName(toUpperName(prev.receiverName));
    if (prev.address) {
      setDeliverAddr(prev.address);
      if (prev.homeDelivery) setHomeDeliver(true);
    }
  }, [receiverPhone, open, mode, orders]);

  // After master load: default itinerary / clamp route to allowed list
  useEffect(() => {
    if (!open || initial) return;
    if (route && allowedBranchNames.length && !allowedBranchNames.includes(route)) {
      setRoute(allowedBranchNames[0] ?? "");
      return;
    }
    if (!route && allowedBranchNames[0]) setRoute(allowedBranchNames[0]);
    const opts = itinerariesForBranchName(route || allowedBranchNames[0]);
    if (!itinerary && opts[0]) setItinerary(opts[0]);
  }, [open, initial, allowedBranchNames, itinerariesForBranchName, route, itinerary]);

  const selectedItinerary = useMemo(
    () => findItinerary(route, itinerary),
    [findItinerary, route, itinerary],
  );

  /** Chỉ khóa VP gửi = VP đang xem khi VP đó thuộc điểm đi lộ trình (đúng tỉnh người gửi). */
  const viewOfficeMatchesDeparture = useMemo(() => {
    if (!effectiveOffice || !selectedItinerary) return false;
    if (isHnItinerarySide(selectedItinerary, "from", offices)) {
      return isHnRegionOffice(effectiveOffice);
    }
    const opts = officeOptionsForPoint(offices, selectedItinerary.departurePoint);
    return opts.some((o) => findOfficeByToken(o.value, offices)?.code === effectiveOffice.code);
  }, [effectiveOffice, selectedItinerary, offices]);

  const lockFromToViewOffice = Boolean(effectiveOffice && viewOfficeMatchesDeparture);

  const pickupProvinceHint = useMemo(
    () => provinceHintFromItinerarySide(selectedItinerary, "from", offices),
    [selectedItinerary, offices],
  );

  /** Tỉnh nhận: ưu tiên VP nhận đã chọn, không thì điểm đến lộ trình. */
  const deliverProvinceHint = useMemo(() => {
    const fromToOffice = provinceHintFromOffice(findOfficeByToken(toOffice, offices));
    if (fromToOffice) return fromToOffice;
    return provinceHintFromItinerarySide(selectedItinerary, "to", offices);
  }, [toOffice, selectedItinerary, offices]);

  const fromOfficeOptions = useMemo(() => {
    // VP đang xem nằm đúng phía điểm đi → chỉ cho chọn đúng VP đó.
    if (lockFromToViewOffice && effectiveOffice) {
      return [officeSelectOption(effectiveOffice)];
    }
    // Master đã đổi tên/mã (VP_* + địa chỉ) — không lọc theo điểm lộ trình/HN nữa.
    return allOfficeSelectOptions(offices);
  }, [lockFromToViewOffice, effectiveOffice, offices]);

  const toOfficeOptions = useMemo(() => allOfficeSelectOptions(offices), [offices]);

  const fillOfficesFromItinerary = (branchName: string, itineraryName: string) => {
    const it = findItinerary(branchName, itineraryName);
    const allValues = new Set(allOfficeSelectOptions(offices).map((o) => o.value));
    const hnFrom = isHnItinerarySide(it, "from", offices);
    const hnTo = isHnItinerarySide(it, "to", offices);

    if (!it) {
      setFromOffice("");
    } else if (effectiveOffice && allValues.has(officeOptionValue(effectiveOffice))) {
      // Ưu tiên VP đang xem; options = full master nên user vẫn đổi được (trừ khi lock).
      setFromOffice(officeOptionValue(effectiveOffice));
    } else {
      const fromHints = hnFrom
        ? hnRegionOffices(offices).map(officeOptionValue)
        : officeOptionsForPoint(offices, it.departurePoint).map((o) => o.value);
      setFromOffice((cur) => (cur && allValues.has(cur) ? cur : fromHints[0] ?? ""));
    }

    if (!it) {
      setToOffice("");
      return;
    }
    const toHints = hnTo
      ? hnRegionOffices(offices).map(officeOptionValue)
      : officeOptionsForPoint(offices, it.destinationPoint).map((o) => o.value);
    setToOffice((cur) => {
      if (cur && allValues.has(cur)) return cur;
      // Chỉ auto-fill khi map được đúng 1 VP; nhiều VP cùng tỉnh → để user chọn.
      return toHints.length === 1 ? toHints[0] : "";
    });
  };

  // Create mode: VP gửi theo VP đang xem + lộ trình
  useEffect(() => {
    if (!open || initial) return;
    fillOfficesFromItinerary(route, itinerary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, route, itinerary, offices, findItinerary, effectiveOfficeCode, lockFromToViewOffice]);


  const goodsFare = items.reduce((s, i) => s + (Number(i.fare) || 0), 0);
  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const codFee = codAmount > 0 ? Number(surchargeExtra || 0) : 0;

  // Phí tận nơi = bảng /phu-phi (kg × km) khi đã có KM Ahamove.
  useEffect(() => {
    if (partyLocked) return;
    const fees = calcHomeDoorFees({
      chargeKg: totalWeight || 1,
      homePickup,
      homeDelivery: homeDeliver,
      pickupKm: homePickup ? pickupKm : null,
      deliveryKm: homeDeliver ? deliverKm : null,
    });
    setPickupFee(fees.pickupFee);
    setDeliverFee(fees.deliveryFee);
  }, [partyLocked, homePickup, homeDeliver, pickupKm, deliverKm, totalWeight, doorFees, homeDeliveryDefault]);

  useEffect(() => {
    if (!homePickup) setPickupKm(null);
  }, [homePickup]);
  useEffect(() => {
    if (!homeDeliver) setDeliverKm(null);
  }, [homeDeliver]);

  const pickupFeeVal = homePickup ? Number(pickupFee || 0) : 0;
  const deliverFeeVal = homeDeliver ? Number(deliverFee || 0) : 0;
  const declaredValue = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
  // Sửa đơn không nạp lại được giá trị khai báo từng kiện, nên giữ phí khai giá đã lưu để không mất tiền.
  const declaredFee = declaredValue > 0 ? calcDeclaredValueFee(declaredValue) : initial?.declaredFee ?? 0;
  const subtotal = goodsFare + pickupFeeVal + deliverFeeVal + codFee + declaredFee;
  // Giảm giá do hệ thống tự áp theo chính sách, không cho sửa tay
  const discountVND = systemDiscount(subtotal);
  const totalFare = Math.max(0, subtotal - discountVND);
  const paidNow =
    payMethod === "Người gửi thanh toán"
      ? totalFare
      : payMethod === "Thu cước 1 phần"
        ? Math.min(totalFare, Number(prepaid) || 0)
        : 0;
  const unpaid = Math.max(0, totalFare - paidNow);
  useEffect(() => {
    if (!codAmount) {
      setSurchargeExtra(0);
      return;
    }
    const cfg = useStore.getState().surcharges?.cod;
    setSurchargeExtra(calcCodFee(codAmount, cfg));
  }, [codAmount]);

  const pricingRules = useStore((s) => s.pricingRules);
  useEffect(() => {
    setItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        const line = computeGoodsLineFare({
          group: it.group,
          kind: it.kind,
          name: it.name,
          sl: it.sl,
          weight: it.weight,
          route,
          d: it.dai,
          r: it.rong,
          c: it.cao,
        });
        if (it.fare === line) return it;
        changed = true;
        return { ...it, fare: line };
      });
      return changed ? next : prev;
    });
  }, [route, items, pricingRules, productPricing]);


  const clear = () => {
    setSenderPhone("");
    setSenderName("");
    setReceiverPhone("");
    setReceiverName("");
    setHomePickup(false);
    setPickupAddr("");
    setHomeDeliver(false);
    setDeliverAddr("");
    setDeliverDate("");
    setIdNumber("");
    setItems([newItem()]);
    setOrderNote("");
    setCodAmount(0);
    setCkSender(false);
    setBankName("");
    setBankAccountNo("");
    setBankAccountName("");
    setInvoiceRequested(false);
    setInvoiceTaxCode("");
    setInvoiceCompanyName("");
    setInvoiceEmail("");
    setInvoiceCompanyAddress("");
    setSurchargeExtra(0);
    setPrepaid(0);

    setPickupFee(0);
    setDeliverFee(0);
  };

  const addOrder = useStore((s) => s.addOrder);
  const updateOrder = useStore((s) => s.updateOrder);
  const [saving, setSaving] = useState(false);
  const [printCode, setPrintCode] = useState<string | null>(null);
  /** Đơn đang chờ nhân viên xác nhận vì VP đã vượt 1000 đơn trong ngày. */
  const [overflowAsk, setOverflowAsk] = useState<{
    payload: NewOrderPayload;
    action: "save" | "print";
    message: string;
  } | null>(null);

  const submit = async (action: "save" | "print") => {
    if (saving) return;
    if (!senderPhone || !receiverPhone) {
      toast.error("Vui lòng nhập SĐT người gửi và người nhận");
      return;
    }
    if (!isValidVNPhone(senderPhone) || !isValidVNPhone(receiverPhone)) {
      toast.error("SĐT không hợp lệ — cần 10 số, đầu 03/05/07/08/09");
      return;
    }
    if (homePickup && !pickupAddr.trim()) {
      toast.error("Vui lòng chọn địa chỉ lấy hàng tận nơi");
      return;
    }
    if (homeDeliver && !deliverAddr.trim()) {
      toast.error("Vui lòng chọn địa chỉ giao hàng tận nơi");
      return;
    }
    if (!fromOffice || !toOffice) {
      toast.error("Vui lòng chọn VP gửi và VP nhận");
      return;
    }
    if (items.some((it) => !resolveGroup(it))) {
      toast.error("Vui lòng chọn nhóm hàng cho mỗi kiện");
      return;
    }
    if (items.some((it) => !isOtherGoodsGroup(resolveGroup(it)) && !(it.kind ?? "").trim())) {
      toast.error("Vui lòng chọn tên hàng hóa cho mỗi kiện");
      return;
    }
    if (items.some((it) => isOtherGoodsGroup(resolveGroup(it)) && !(it.name ?? "").trim())) {
      toast.error("Vui lòng nhập tên hàng hoá khi chọn nhóm Khác");
      return;
    }
    if (items.some((it) => !(Number(it.weight) > 0))) {
      toast.error("Mỗi kiện phải có cân nặng lớn hơn 0");
      return;
    }
    if (invoiceRequested) {
      if (!invoiceTaxCode.trim() || !invoiceCompanyName.trim() || !invoiceEmail.trim() || !invoiceCompanyAddress.trim()) {
        toast.error("Vui lòng điền đủ thông tin xuất hoá đơn");
        return;
      }
      if (!isValidVietnamTaxCode(invoiceTaxCode)) {
        toast.error("Mã số thuế không hợp lệ — kiểm tra lại (MISA không nhận MST điền bừa)");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceEmail.trim())) {
        toast.error("Email nhận hoá đơn không hợp lệ");
        return;
      }
    }
    if (!offices.length) {
      toast.error("Danh sách văn phòng chưa tải xong — vui lòng đợi vài giây rồi thử lại");
      return;
    }
    const { resolveOfficeCodeStrict } = await import("@/lib/api/sync");
    const fromCode = resolveOfficeCodeStrict(fromOffice);
    const toCode = resolveOfficeCodeStrict(toOffice);
    if (!fromCode) {
      toast.error(
        `Không xác định được VP gửi (“${fromOffice}”). Chọn VP trong danh sách (vd. VP Nam Định), không dùng tên tỉnh/tuyến.`,
      );
      return;
    }
    if (!toCode) {
      toast.error(
        `Không xác định được VP nhận (“${toOffice}”). Chọn VP trong danh sách hoặc tải lại trang.`,
      );
      return;
    }
    if (mode === "edit") {
      if (initial?.code) {
        const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
        const { packageCount } = packagesFromItems(items);
        const prev = useStore.getState().orders.find((o) => o.code === initial.code);
        const nextSender = toUpperName(senderName);
        const nextReceiver = toUpperName(receiverName) || "—";
        const detailParts = [
          prev?.senderName !== nextSender ? `Người gửi ${prev?.senderName ?? "—"}→${nextSender}` : "",
          prev?.senderPhone !== senderPhone ? `SĐT gửi ${prev?.senderPhone ?? "—"}→${senderPhone}` : "",
          prev?.receiverName !== nextReceiver ? `Người nhận ${prev?.receiverName ?? "—"}→${nextReceiver}` : "",
          prev?.receiverPhone !== receiverPhone ? `SĐT nhận ${prev?.receiverPhone ?? "—"}→${receiverPhone}` : "",
          prev?.fromOffice !== fromCode || prev?.toOffice !== toCode
            ? `Tuyến ${prev?.fromOffice ?? "—"}→${prev?.toOffice ?? "—"} → ${fromCode}→${toCode}`
            : "",
          Math.abs((prev?.weightKg ?? 0) - totalWeight) > 1e-6
            ? `KL ${prev?.weightKg ?? 0}→${totalWeight}`
            : "",
          (prev?.quantity ?? 0) !== packageCount ? `Số kiện ${prev?.quantity ?? 0}→${packageCount}` : "",
          (prev?.fare ?? 0) !== totalFare ? `Cước ${prev?.fare ?? 0}→${totalFare}` : "",
          (prev?.codAmount ?? 0) !== codAmount ? `COD ${prev?.codAmount ?? 0}→${codAmount}` : "",
          !!prev?.homeDelivery !== homeDeliver ? `GTN ${prev?.homeDelivery ? "có" : "không"}→${homeDeliver ? "có" : "không"}` : "",
          !!prev?.homePickup !== homePickup ? `LTN ${prev?.homePickup ? "có" : "không"}→${homePickup ? "có" : "không"}` : "",
        ]
          .filter(Boolean)
          .join("; ")
          .slice(0, 240);
        updateOrder(
          initial.code,
          {
            senderPhone,
            senderName: nextSender,
            receiverName: nextReceiver,
            receiverPhone,
            fromOffice: fromCode,
            toOffice: toCode,
            note: embedWarehouseInSeqs(
              orderNoteWithPackages(orderNote, items, goodsFare),
              warehouseInSeqs(prev ?? { note: undefined }),
            ),
            weightKg: totalWeight,
            quantity: packageCount,
            fare: totalFare,
            goodsFare,
            declaredFee,
            discountAmount: discountVND,
            codAmount: codAmount > 0 ? codAmount : 0,
            codFee: codAmount > 0 ? codFee : 0,
            pickupAddress: homePickup ? pickupAddr || undefined : undefined,
            address: homeDeliver ? deliverAddr || undefined : undefined,
            homeDelivery: homeDeliver,
            homePickup,
            bankName: ckSender ? bankName || undefined : "",
            bankAccountNo: ckSender ? bankAccountNo || undefined : "",
            bankAccountName: ckSender ? bankAccountName || undefined : "",
            invoiceRequested,
            invoiceTaxCode: invoiceRequested ? normalizeTaxCode(invoiceTaxCode) : "",
            invoiceCompanyName: invoiceRequested ? invoiceCompanyName.trim() : "",
            invoiceEmail: invoiceRequested ? invoiceEmail.trim() : "",
            invoiceCompanyAddress: invoiceRequested ? invoiceCompanyAddress.trim() : "",
          },
          {
            eventAction: "ORDER_EDIT",
            eventDetail: detailParts || "Sửa form tạo đơn",
          },
        );
      }
      toast.success(`Đã cập nhật đơn hàng${initial?.code ? ` ${initial.code}` : ""}`);
      onOpenChange(false);
      return;
    }

    const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
    const { packageCount, goodsLabel } = packagesFromItems(items);
    const code = genOrderCode(fromCode);
    const now = new Date().toISOString();

    await persist(
      {
        code,
        senderPhone,
        senderName: toUpperName(senderName),
        receiverName: toUpperName(receiverName) || "—",
        receiverPhone,
        fromOffice: fromCode,
        toOffice: toCode,
        goodsType: goodsLabel,
        collectForm:
          codAmount > 0
            ? "COD"
            : payMethod === "Người nhận thanh toán"
              ? "NHAN_TRA"
              : "GUI_TRA",
        weightKg: totalWeight,
        quantity: packageCount,
        fare: totalFare,
        goodsFare,
        declaredFee,
        discountAmount: discountVND,
        pickupFee: Number(pickupFee) || 0,
        deliveryFee: Number(deliverFee) || 0,
        pickupKm: homePickup && pickupKm != null ? pickupKm : undefined,
        deliveryKm: homeDeliver && deliverKm != null ? deliverKm : undefined,
        route,
        itinerary,
        branchCode: branchCodeOf(route),
        status: "CONFIRMED",
        createdAt: now,
        updatedAt: now,
        note: orderNoteWithPackages(orderNote, items, goodsFare),
        homeDelivery: homeDeliver,
        homePickup,
        paidAmount: paidNow,
        pickupAddress: homePickup ? pickupAddr || undefined : undefined,
        address: homeDeliver ? deliverAddr || undefined : undefined,
        codAmount: codAmount > 0 ? codAmount : 0,
        codFee: codAmount > 0 ? codFee : 0,
        bankName: ckSender ? bankName || undefined : undefined,
        bankAccountNo: ckSender ? bankAccountNo || undefined : undefined,
        bankAccountName: ckSender ? bankAccountName || undefined : undefined,
        invoiceRequested,
        invoiceTaxCode: invoiceRequested ? normalizeTaxCode(invoiceTaxCode) : undefined,
        invoiceCompanyName: invoiceRequested ? invoiceCompanyName.trim() : undefined,
        invoiceEmail: invoiceRequested ? invoiceEmail.trim() : undefined,
        invoiceCompanyAddress: invoiceRequested ? invoiceCompanyAddress.trim() : undefined,
      },
      action,
    );
  };

  /** Lưu đơn lên BE; VP vượt 1000 đơn/ngày thì hỏi lại rồi gọi chính hàm này với cờ xác nhận. */
  const persist = async (
    payload: NewOrderPayload,
    action: "save" | "print",
    confirmDailyOverflow?: boolean,
  ) => {
    setSaving(true);
    try {
      const result = await addOrder(payload, confirmDailyOverflow ? { confirmDailyOverflow: true } : undefined);

      if (!result.ok) {
        if (result.needsDailyOverflowConfirm) {
          setOverflowAsk({ payload, action, message: result.error });
          return;
        }
        toast.error(result.error);
        return;
      }

      const savedCode = result.code;
      if (action === "print") {
        toast.success(`Đã lưu đơn ${savedCode} — mở in tem`);
        setPrintCode(savedCode);
      } else {
        toast.success(`Đã lưu đơn ${savedCode}`);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };


  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1560px] flex-col overflow-hidden p-0">
        <DialogTitle className="sr-only">
          {mode === "edit" ? `Sửa đơn hàng${initial?.code ? ` · ${initial.code}` : ""}` : "Tạo đơn hàng"}
        </DialogTitle>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-[19px] pb-[19px] pt-[32px] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5 lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-5 lg:h-full lg:overflow-y-auto lg:pr-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-end">
            <F label={<span className="flex items-center gap-1"><RouteIcon className="h-3 w-3 shrink-0" />Chọn tuyến *</span>} labelClassName="flex h-4 items-center">
              <SearchableSelect
                value={route}
                onValueChange={(v) => {
                  setRoute(v);
                  const nextIt = itinerariesForBranchName(v)[0] ?? "";
                  setItinerary(nextIt);
                }}
                className="h-9 items-center py-0"
                placeholder="Chọn tuyến"
                options={allowedBranchNames.map((r) => ({ value: r, label: r }))}
              />
            </F>
            <F label="Chọn lộ trình *" labelClassName="flex h-4 items-center">
              <SearchableSelect
                value={itinerary}
                onValueChange={setItinerary}
                className="h-9 items-center py-0"
                placeholder="Chọn lộ trình"
                options={itinerariesForBranchName(route).map((it) => ({ value: it, label: it }))}
              />
            </F>
          </div>

          {/* Sender section */}
          <Section icon={<User className="h-4 w-4" />} title="Người gửi">
            {partyLocked && (
              <p className="mb-3 text-xs text-muted-foreground">
                Sửa đơn không đổi được thông tin người gửi / người nhận.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <F label="SĐT Người Gửi *">
                <PhoneInput placeholder="VD: 0371234567" value={senderPhone} readOnly={partyLocked} className={lockedInputClass} onChange={setSenderPhone} />
              </F>
              <F label="Tên người gửi">
                <NameInput
                  placeholder="Tên người gửi"
                  value={senderName}
                  readOnly={partyLocked}
                  className={lockedInputClass}
                  onChange={setSenderName}
                />

              </F>
              <F label="VP gửi *">
                <SearchableSelect
                  value={fromOffice}
                  onValueChange={setFromOffice}
                  className="h-auto min-h-9 py-1.5"
                  placeholder={itinerary ? "Chọn VP gửi" : "Chọn lộ trình trước"}
                  emptyText={itinerary ? "Không có VP khớp điểm đi" : "Chọn lộ trình trước"}
                  disabled={!itinerary || lockFromToViewOffice || partyLocked}
                  options={fromOfficeOptions}
                />
              </F>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr] md:items-end">
              <label className="flex items-center gap-2 whitespace-nowrap pb-2.5 text-sm">
                <Checkbox checked={homePickup} disabled={partyLocked} onCheckedChange={(v) => setHomePickup(Boolean(v))} />
                <MapPin className="h-3.5 w-3.5 text-success" />
                Lấy tận nơi
              </label>
              {homePickup ? (
                <AddressPicker
                  label="Địa chỉ lấy hàng"
                  required
                  value={pickupAddr}
                  onChange={setPickupAddr}
                  preferredProvince={pickupProvinceHint}
                  disabled={partyLocked}
                />
              ) : null}
            </div>
            {homePickup ? (
              <div className="mt-3 w-full min-w-0">
                <HomeDeliveryMap
                  enabled
                  address={pickupAddr}
                  label="lấy tận nơi"
                  officeLat={findOfficeByToken(fromOffice, offices)?.latitude ?? null}
                  officeLng={findOfficeByToken(fromOffice, offices)?.longitude ?? null}
                  officeAddress={findOfficeByToken(fromOffice, offices)?.address}
                  onKmChange={setPickupKm}
                />
              </div>
            ) : null}

          </Section>

          {/* Receiver section */}
          <Section icon={<Truck className="h-4 w-4" />} title="Người nhận">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <F label="SĐT Người Nhận *">
                <PhoneInput placeholder="VD: 0377654321" value={receiverPhone} readOnly={partyLocked} className={lockedInputClass} onChange={setReceiverPhone} />
              </F>
              <F label="Tên người nhận">
                <NameInput
                  placeholder="Tên người nhận"
                  value={receiverName}
                  readOnly={partyLocked}
                  className={lockedInputClass}
                  onChange={setReceiverName}
                />

              </F>
              <F label="VP Nhận *">
                <SearchableSelect
                  value={toOffice}
                  onValueChange={setToOffice}
                  className="h-auto min-h-9 py-1.5"
                  placeholder={itinerary ? "Chọn VP nhận" : "Chọn lộ trình trước"}
                  emptyText={itinerary ? "Không có VP khớp điểm đến" : "Chọn lộ trình trước"}
                  disabled={!itinerary || partyLocked}
                  options={toOfficeOptions}
                />
              </F>
              <F label="CMND/Passport">
                <Input placeholder="VD: 191943210" value={idNumber} readOnly={partyLocked} className={lockedInputClass} onChange={(e) => setIdNumber(e.target.value)} />
              </F>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr] md:items-end">
              <label className="flex items-center gap-2 whitespace-nowrap pb-2.5 text-sm">
                <Checkbox checked={homeDeliver} disabled={partyLocked} onCheckedChange={(v) => setHomeDeliver(Boolean(v))} />
                <MapPin className="h-3.5 w-3.5 text-success" />
                Giao tận nơi
              </label>
              {homeDeliver ? (
                <AddressPicker
                  label="Địa chỉ giao hàng"
                  required
                  value={deliverAddr}
                  onChange={setDeliverAddr}
                  preferredProvince={deliverProvinceHint}
                  disabled={partyLocked}
                />
              ) : null}
            </div>
            {homeDeliver ? (
              <div className="mt-3 w-full min-w-0">
                <HomeDeliveryMap
                  enabled
                  address={deliverAddr}
                  label="giao tận nơi"
                  officeLat={findOfficeByToken(toOffice, offices)?.latitude ?? null}
                  officeLng={findOfficeByToken(toOffice, offices)?.longitude ?? null}
                  officeAddress={findOfficeByToken(toOffice, offices)?.address}
                  onKmChange={setDeliverKm}
                />
              </div>
            ) : null}
          </Section>

          {/* Items table */}
          <Section icon={<PackagePlus className="h-4 w-4" />} title="Danh sách hàng hóa">
            <div className="space-y-3">
              {items.map((it, idx) => {
                const group = resolveGroup(it);
                const isOther = isOtherGoodsGroup(group);
                const showProduct = Boolean(group) && !isOther;
                const cols = isOther
                  ? "1fr 1fr 68px 68px 68px"
                  : showProduct
                    ? "1fr 1fr 68px 68px 68px"
                    : "1fr 68px 68px 68px";
                const row2 = "72px 90px 1fr 1fr 2fr";
                return (
                  <div key={it.id} className="rounded-lg border bg-background px-4 pb-3 pt-2.5">
                    {/* Header row */}
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Kiện {idx + 1}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {/* Row 1: nhóm hàng · [tên hàng] · dài · rộng · cao */}
                    <div className="grid gap-3" style={{ gridTemplateColumns: cols }}>
                      <F label="Nhóm hàng">
                        <SearchableSelect
                          value={group}
                          onValueChange={(v) =>
                            updateItem(it.id, {
                              group: v,
                              kind: isOtherGoodsGroup(v) ? OTHER_GOODS : "",
                              name: "",
                            })
                          }
                          className="h-9"
                          placeholder="Chọn nhóm hàng"
                          options={goodsGroupOptions}
                        />
                      </F>
                      {showProduct && (
                        <F label="Tên hàng hóa">
                          <SearchableSelect
                            value={it.kind}
                            onValueChange={(v) => updateItem(it.id, { kind: v, name: "" })}
                            className="h-9"
                            placeholder="Chọn tên hàng hóa"
                            options={productNameOptions(group)}
                          />
                        </F>
                      )}
                      {isOther && (
                        <F label="Nhập tên hàng hoá *">
                          <Input
                            className="h-9"
                            placeholder="Nhập tên hàng hóa"
                            value={it.name}
                            onChange={(e) => updateItem(it.id, { name: e.target.value, kind: OTHER_GOODS })}
                            required
                          />
                        </F>
                      )}
                      <F label="Dài (cm)">
                        <NumberInput className="h-9 w-full" placeholder="0" value={it.dai} onChange={(dai) => updateItem(it.id, { dai })} />
                      </F>
                      <F label="Rộng (cm)">
                        <NumberInput className="h-9 w-full" placeholder="0" value={it.rong} onChange={(rong) => updateItem(it.id, { rong })} />
                      </F>
                      <F label="Cao (cm)">
                        <NumberInput className="h-9 w-full" placeholder="0" value={it.cao} onChange={(cao) => updateItem(it.id, { cao })} />
                      </F>
                    </div>
                    {/* Row 2: số lượng · cân nặng · giá trị · cước · ghi chú */}
                    <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: row2 }}>
                      <F label="Số lượng">
                        <NumberInput className="h-9 w-full" value={it.sl} onChange={(sl) => updateItem(it.id, { sl })} />
                      </F>
                      <F label="Cân nặng (KG) *">
                        <NumberInput
                          className="h-9 w-full"
                          decimal
                          min={0}
                          value={it.weight}
                          onChange={(weight) => updateItem(it.id, { weight })}
                        />
                      </F>
                      <F label="Giá trị hàng">
                        <MoneyInput value={it.value} onChange={(value) => updateItem(it.id, { value })} />
                      </F>
                      <F label="Cước hàng">
                        <MoneyInput value={it.fare} onChange={() => undefined} readOnly tabIndex={-1} />
                      </F>
                      <F label="Ghi chú">
                        <Input className="h-9 w-full" placeholder="-" value={it.note} onChange={(e) => updateItem(it.id, { note: e.target.value })} />
                      </F>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setItems((p) => [...p, newItem()])}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 text-sm font-medium text-primary hover:bg-primary/5"
              >
                <Plus className="h-4 w-4" />
                Thêm kiện
              </button>
            </div>
          </Section>
        </div>

        <div className="min-w-0 space-y-5 lg:sticky lg:top-0 lg:h-full lg:self-start lg:overflow-y-auto lg:pl-1">
          {/* Payment section */}
          <Section icon={<Receipt className="h-4 w-4" />} title="Thanh toán & ghi chú">
            <div className="space-y-4">
              {/* LEFT: Payment details */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <F label="Hình thức thanh toán">
                    <SearchableSelect
                      value={payMethod}
                      onValueChange={setPayMethod}
                      className="h-9"
                      options={PAY_METHODS.map((m) => ({ value: m, label: m }))}
                    />
                  </F>
                  {payMethod === "Thu cước 1 phần" && (
                    <F label="Người gửi trả trước">
                      <MoneyInput value={prepaid} onChange={setPrepaid} />
                    </F>
                  )}
                  <F label="Thu Hộ (COD)">
                    <MoneyInput value={codAmount} onChange={setCodAmount} />
                  </F>
                  <F label="Phí thu hộ COD">
                    <MoneyInput
                      value={surchargeExtra}
                      onChange={setSurchargeExtra}
                      disabled={!codAmount}
                      placeholder={!codAmount ? "Nhập Thu hộ COD trước" : ""}
                    />
                  </F>
                  <F label="Giảm giá (hệ thống)">
                    <Input value={formatVND(discountVND)} readOnly disabled />
                  </F>

                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={ckSender} onCheckedChange={(v) => setCkSender(Boolean(v))} />
                    Tài khoản nhận thu hộ
                  </label>
                  {ckSender && (
                    <div className="grid grid-cols-1 gap-2 rounded-md border bg-background p-2.5 sm:grid-cols-3">
                      <F label="Ngân hàng">
                        <SearchableSelect
                          value={bankName}
                          onValueChange={setBankName}
                          className="h-9"
                          placeholder="Chọn ngân hàng"
                          options={["Vietcombank","VietinBank","BIDV","Agribank","Techcombank","MB Bank","ACB","VPBank","TPBank","Sacombank","SHB","HDBank","VIB","MSB","OCB"].map((b) => ({ value: b, label: b }))}
                        />
                      </F>
                      <F label="Số tài khoản">
                        <Input placeholder="Nhập số tài khoản" value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} />
                      </F>
                      <F label="Tên tài khoản">
                        <Input placeholder="Chủ tài khoản" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} />
                      </F>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={invoiceRequested}
                      onCheckedChange={(v) => setInvoiceRequested(Boolean(v))}
                    />
                    Xuất hoá đơn
                  </label>
                  {invoiceRequested && (
                    <div className="grid grid-cols-1 gap-2.5 rounded-md border border-sky-200 bg-sky-50/70 p-3">
                      <F label="Mã số thuế *">
                        <Input
                          placeholder="Nhập mã số thuế"
                          value={invoiceTaxCode}
                          onChange={(e) => setInvoiceTaxCode(e.target.value)}
                        />
                      </F>
                      <F label="Tên công ty *">
                        <Input
                          placeholder="Nhập tên công ty"
                          value={invoiceCompanyName}
                          onChange={(e) => setInvoiceCompanyName(e.target.value)}
                        />
                      </F>
                      <F label="Email nhận hoá đơn *">
                        <Input
                          type="email"
                          placeholder="example@company.com"
                          value={invoiceEmail}
                          onChange={(e) => setInvoiceEmail(e.target.value)}
                        />
                      </F>
                      <F label="Địa chỉ công ty *">
                        <Input
                          placeholder="Nhập địa chỉ công ty"
                          value={invoiceCompanyAddress}
                          onChange={(e) => setInvoiceCompanyAddress(e.target.value)}
                        />
                      </F>
                    </div>
                  )}
                </div>

                <F label="Ghi chú đơn hàng">
                  <Textarea rows={3} placeholder="Nhập ghi chú" value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
                </F>
              </div>

              {/* RIGHT: Summary */}
              <div>
                <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Thông tin thanh toán</div>
                  <Row label="Cước hàng" value={goodsFare} always />
                  <Row label="Cước lấy hàng tận nơi" value={pickupFeeVal} />
                  {homePickup && pickupKm != null ? (
                    <p className="text-[11px] text-muted-foreground -mt-1 mb-1">Theo bảng phí · {pickupKm.toFixed(2)} km</p>
                  ) : homePickup ? (
                    <p className="text-[11px] text-muted-foreground -mt-1 mb-1">Chờ KM Ahamove để tính phí</p>
                  ) : null}
                  <Row label="Cước giao hàng tận nơi" value={deliverFeeVal} />
                  {homeDeliver && deliverKm != null ? (
                    <p className="text-[11px] text-muted-foreground -mt-1 mb-1">Theo bảng phí · {deliverKm.toFixed(2)} km</p>
                  ) : homeDeliver ? (
                    <p className="text-[11px] text-muted-foreground -mt-1 mb-1">Chờ KM Ahamove để tính phí</p>
                  ) : null}
                  <Row label="Phí thu hộ COD" value={codFee} />
                  <Row label="Phí khai báo giá trị" value={declaredFee} />
                  <Row label="Giảm giá" value={-discountVND} />
                  <Row label="Đã thu" value={paidNow} />

                  <div className="border-t pt-1.5 flex items-center justify-between font-semibold">
                    <span>Tổng phải thu</span>
                    <span className="text-primary">{totalFare.toLocaleString("vi-VN")} VND</span>
                  </div>
                  {unpaid > 0 && (
                    <div className="flex items-center justify-between text-xs text-destructive">
                      <span>Còn phải thu</span>
                      <span>{unpaid.toLocaleString("vi-VN")} VND</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-card px-[19px] py-[13px]">
        {mode === "edit" ? (
          <>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Hủy</Button>
            <Button size="sm" className="gap-1.5 bg-primary" onClick={() => void submit("save")} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="destructive" className="gap-1.5" onClick={clear} disabled={saving}>
              <Trash2 className="h-3.5 w-3.5" /> Xóa
            </Button>
            <Button size="sm" className="gap-1.5 bg-primary" onClick={() => void submit("save")} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Đang lưu…" : "Tạo đơn"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void submit("print")} disabled={saving}>
              <Printer className="h-3.5 w-3.5" /> {saving ? "Đang lưu…" : "Tạo và in"}
            </Button>
          </>
        )}
      </div>

      </DialogContent>
    </Dialog>

    <PrintLabelDialog
      code={printCode}
      batchPackages
      autoPrint
      open={!!printCode}
      onOpenChange={(v) => {
        if (!v) setPrintCode(null);
      }}
    />

    <AlertDialog open={!!overflowAsk} onOpenChange={(o) => !o && setOverflowAsk(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Vượt 1000 đơn trong ngày</AlertDialogTitle>
          <AlertDialogDescription>
            {overflowAsk?.message}. Vẫn tạo đơn này (đã vượt ngưỡng 1000 đơn/VP trong ngày)?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const ask = overflowAsk;
              setOverflowAsk(null);
              if (ask) void persist(ask.payload, ask.action, true);
            }}
          >
            Vẫn tạo đơn
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

/** Khoản phụ = 0 thì ẩn dòng; chỉ dòng `always` (cước hàng) luôn hiện. */
function Row({ label, value, always }: { label: string; value: number; always?: boolean }) {
  if (!always && !value) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatVND(value)}</span>
    </div>
  );
}

function F({
  label,
  children,
  labelClassName,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  labelClassName?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className={cn("text-xs font-medium text-muted-foreground", labelClassName)}>{label}</Label>
      {children}
    </div>
  );
}
