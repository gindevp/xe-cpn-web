import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  Package,
  Plus,
  Printer,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MoneyInput } from "@/components/MoneyInput";
import { NameInput } from "@/components/NameInput";
import { PhoneInput } from "@/components/PhoneInput";
import { ContactPickButton } from "@/components/ContactPickButton";
import { NumberInput } from "@/components/NumberInput";
import { toUpperName } from "@/lib/vn-name";
import {
  OTHER_GOODS,
  formatDateTime,
  formatVND,
  goodsTypeFromName,
  officeName,
  findOfficeByToken,
  foldOfficeKey,
  officeOptionValue,
  resolveItineraryFromOffices,
  type OfficeRec,
} from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import {
  calcCodFee,
  calcDeclaredValueFee,
  computeGoodsLineFare,
  isValidVNPhone,
} from "@/lib/pricing";
import {
  embedPackageFares,
  embedPackageGoods,
  embedPackageDims,
  embedPackageItemQtys,
  embedPackageWeightsKg,
  packageRows,
  splitMoney,
} from "@/lib/package-label";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { itinerariesAllowedFrom } from "@/lib/api/vehicle-events-api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import { OfficePickerSheet } from "@/components/OfficePickerSheet";
import {
  blobToDataUrl,
  downloadBlob,
  guestBillFileName,
  guestBillPayLabel,
  renderGuestBillPng,
  shareImageToGallery,
} from "@/lib/guest-bill-image";
import { isHandheldCameraDevice } from "@/lib/device";
import { compressToDataUrl } from "@/components/PodPhotoInput";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/tao-don")({
  head: () => ({
    meta: [
      { title: "Tạo đơn — X.E Việt Nam" },
      { name: "description", content: "Khách tạo đơn hàng qua QR — X.E Việt Nam." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { vp?: string } =>
    search.vp != null && String(search.vp).trim() ? { vp: String(search.vp).trim() } : {},
  component: function TaoDonPage() {
    const { vp } = Route.useSearch();
    return <PublicOrderForm presetFromOffice={vp} />;
  },
});

/** VP trong link QR: cột ID ở Danh mục VP (/63418) hoặc mã VP (/tao-don/VP_ND). */

/** VP nhận trên màn khách: 77 Trần Anh Tông lên đầu, Song Hào xuống cuối. */
function compareGuestDestOffices(a: OfficeRec, b: OfficeRec): number {
  const rank = (o: OfficeRec) => {
    const blob = foldOfficeKey(`${o.code} ${o.name} ${o.address ?? ""}`);
    if (blob.includes("77trananhtong") || foldOfficeKey(o.code) === "vpnd77") return -1;
    if (blob.includes("songhao")) return 1;
    return 0;
  };
  const d = rank(a) - rank(b);
  return d !== 0 ? d : a.name.localeCompare(b.name, "vi");
}
function findPresetOffice(raw: string | undefined, offices: OfficeRec[]): OfficeRec | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  if (/^\d+$/.test(t)) {
    return offices.find((o) => o.sourceId === Number(t));
  }
  const upper = t.toUpperCase();
  return offices.find((o) => o.code.toUpperCase() === upper) ?? findOfficeByToken(t, offices);
}

const STEPS = [
  { id: 1, short: "VP gửi & nhận" },
  { id: 2, short: "Thông tin đơn hàng" },
] as const;
const LAST_STEP = STEPS.length;

/** Giống TaoDonDialog — hình thức thanh toán cước. */
// Không có "Công nợ": khách tự tạo đơn không ghi nợ được, chỉ nhân viên tạo đơn công nợ.
const PAY_METHODS = [
  "Người gửi thanh toán",
  "Người nhận thanh toán",
  "Thu cước 1 phần",
] as const;
const DEFAULT_PAY_METHOD: string = "Người nhận thanh toán";

const BANK_OPTIONS = [
  "Vietcombank",
  "VietinBank",
  "BIDV",
  "Agribank",
  "Techcombank",
  "MB Bank",
  "ACB",
  "VPBank",
  "TPBank",
  "Sacombank",
  "SHB",
  "HDBank",
  "VIB",
  "MSB",
  "OCB",
].map((b) => ({ value: b, label: b }));

const onlyDigits = (s: string) => s.replace(/[^\d]/g, "");

const fieldSelectClass =
  "h-12 rounded-xl border-0 bg-[#E9EEF5] px-3 text-base shadow-none hover:bg-[#E1E8F2] focus-visible:ring-1 focus-visible:ring-primary";
const officePickerClass = "min-h-12 rounded-xl bg-[#E9EEF5] px-3 py-2 hover:bg-[#E1E8F2]";
const fieldInputClass =
  "h-12 rounded-xl border-0 bg-[#E9EEF5] px-3 shadow-none focus-visible:ring-1 focus-visible:ring-primary";

type Item = {
  id: string;
  sl: number;
  group: string;
  kind: string;
  name: string;
  weight: number;
  dai: number;
  rong: number;
  cao: number;
  value: number;
  fare: number;
};

const newItemId = () => Math.random().toString(36).slice(2, 9);

const newItem = (): Item => ({
  id: newItemId(),
  sl: 1,
  group: OTHER_GOODS,
  kind: OTHER_GOODS,
  name: "",
  weight: 1,
  dai: 10,
  rong: 10,
  cao: 10,
  value: 0,
  fare: 0,
});

function packagesFromItems(items: Item[]) {
  const packageCount = Math.max(1, items.length);
  const goodsKinds = items.map((i) => i.kind.trim() || "Hàng hoá");
  const goodsNames = items.map((i) => (i.kind.trim() === OTHER_GOODS ? i.name.trim() : ""));
  return { packageCount, goodsKinds, goodsNames, goodsLabel: goodsKinds.join(", ") };
}

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
  note = embedPackageDims(
    note,
    items.map((i) => ({ d: Number(i.dai) || 0, r: Number(i.rong) || 0, c: Number(i.cao) || 0 })),
  );
  return note;
}

export function PublicOrderForm({ presetFromOffice }: { presetFromOffice?: string }) {
  const navigate = useNavigate();
  const offices = useStore((s) => s.offices);
  const profiles = useStore((s) => s.customerProfiles);
  const productPricing = useStore((s) => s.productPricing);
  const pricingRules = useStore((s) => s.pricingRules);
  const addOrder = useStore((s) => s.addOrder);
  const upsertCustomer = useStore((s) => s.upsertCustomer);
  const { branchCodeOf, itineraries, loading: itineraryLoading } =
    useBranchItineraryMaster();
  const [officesLoading, setOfficesLoading] = useState(() => offices.length === 0);
  const masterLoading = itineraryLoading || (officesLoading && offices.length === 0);

  const [step, setStep] = useState(1);
  const [route, setRoute] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderName, setSenderName] = useState("");
  const [fromOffice, setFromOffice] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [toOffice, setToOffice] = useState("");
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [goodsPhoto, setGoodsPhoto] = useState("");
  const [payMethod, setPayMethod] = useState<string>(DEFAULT_PAY_METHOD);
  const [prepaid, setPrepaid] = useState(0);
  const [codAmount, setCodAmount] = useState(0);
  const [surchargeExtra, setSurchargeExtra] = useState(0);
  const [ckSender, setCkSender] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<OrderX | null>(null);
  const [printLabels, setPrintLabels] = useState(false);

  useEffect(() => {
    void import("@/lib/api/sync")
      .then((m) => m.syncPublicCreateOrderFromApi())
      .catch(() => undefined)
      .finally(() => setOfficesLoading(false));
  }, []);

  const [officeItineraries, setOfficeItineraries] = useState<Record<string, string[]>>({});
  useEffect(() => {
    void (async () => {
      const { isApiEnabled } = await import("@/lib/api/client");
      if (!isApiEnabled()) return;
      const { getAllOfficeVehicleItineraries } = await import("@/lib/api/vehicle-events-api");
      setOfficeItineraries(await getAllOfficeVehicleItineraries().catch(() => ({})));
    })();
  }, []);
  const resolvePair = (fromRec: OfficeRec, toRec: OfficeRec) =>
    resolveItineraryFromOffices(
      fromRec,
      toRec,
      itinerariesAllowedFrom(itineraries, fromRec.code, officeItineraries),
    );

  const presetOffice = useMemo(
    () => findPresetOffice(presetFromOffice, offices),
    [presetFromOffice, offices],
  );
  const presetValue = presetOffice ? officeOptionValue(presetOffice) : "";
  const presetMissingWarned = useRef(false);

  useEffect(() => {
    if (presetValue) {
      setFromOffice((cur) => cur || presetValue);
      return;
    }
    if (presetFromOffice && !officesLoading && offices.length > 0 && !presetMissingWarned.current) {
      presetMissingWarned.current = true;
      toast.error("Không tìm thấy văn phòng trong link — vui lòng chọn VP gửi");
    }
  }, [presetValue, presetFromOffice, officesLoading, offices.length]);

  useEffect(() => {
    const fromRec = findOfficeByToken(fromOffice, offices);
    const toRec = findOfficeByToken(toOffice, offices);
    if (!fromRec || !toRec) {
      setRoute("");
      setItinerary("");
      return;
    }
    const hit = resolvePair(fromRec, toRec);
    if (hit) {
      setRoute(hit.branchName);
      setItinerary(hit.itineraryName);
    } else {
      setRoute("");
      setItinerary("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromOffice, toOffice, offices, itineraries, officeItineraries]);

  const fromOfficeRec = useMemo(() => findOfficeByToken(fromOffice, offices), [fromOffice, offices]);

  /** Chỉ VP nhận có lộ trình đang bật từ VP gửi — tránh khách chọn cặp không khớp tuyến. */
  const toOfficeList = useMemo(() => {
    if (!fromOfficeRec) return offices;
    return offices.filter(
      (o) =>
        o.code !== fromOfficeRec.code && resolvePair(fromOfficeRec, o) != null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromOfficeRec, offices, itineraries, officeItineraries]);

  useEffect(() => {
    if (!toOffice || masterLoading) return;
    if (!toOfficeList.some((o) => officeOptionValue(o) === toOffice)) setToOffice("");
  }, [toOffice, toOfficeList, masterLoading]);

  const senderNameRef = useRef(senderName);
  senderNameRef.current = senderName;
  useEffect(() => {
    if (!isValidVNPhone(senderPhone) || senderName) return;
    if (profiles[senderPhone]) {
      setSenderName(toUpperName(profiles[senderPhone].name));
      toast.info("Đã tự điền tên gửi từ hồ sơ khách");
      return;
    }
    const phone = senderPhone;
    let cancelled = false;
    void (async () => {
      const { isApiEnabled } = await import("@/lib/api/client");
      if (!isApiEnabled()) return;
      const { guestSenderName } = await import("@/lib/api/domain-api");
      const res = await guestSenderName(phone).catch(() => null);
      if (cancelled || !res?.found || !res.name || senderNameRef.current) return;
      setSenderName(toUpperName(res.name));
      toast.info("Đã tự điền tên gửi từ đơn trước");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderPhone]);

  /** Cước từng kiện — cùng logic TaoDonDialog (bảng giá SP → else cân/kích thước). */
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

  useEffect(() => {
    if (!codAmount) {
      setSurchargeExtra(0);
      return;
    }
    const cfg = useStore.getState().surcharges?.cod;
    setSurchargeExtra(calcCodFee(codAmount, cfg));
  }, [codAmount]);

  const goodsFare = items.reduce((s, i) => s + (Number(i.fare) || 0), 0);
  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const declaredValue = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
  const declaredFee = declaredValue > 0 ? calcDeclaredValueFee(declaredValue) : 0;
  const codFee = codAmount > 0 ? Number(surchargeExtra || 0) : 0;

  // Giống TaoDonDialog: giảm giá hệ thống (chưa có policy thì 0).
  const subtotal = goodsFare + codFee + declaredFee;
  const discountVND = 0;
  const totalFare = Math.max(0, subtotal - discountVND);
  const paidNow =
    payMethod === "Người gửi thanh toán"
      ? totalFare
      : payMethod === "Thu cước 1 phần"
        ? Math.min(totalFare, Number(prepaid) || 0)
        : 0;
  const unpaid = Math.max(0, totalFare - paidNow);

  const headerTitle = step === 1 ? "Tạo đơn giao hàng" : "Thông tin đơn hàng";

  const goBack = () => {
    if (step > 1) {
      setStep((s) => s - 1);
      return;
    }
    void navigate({ to: "/" });
  };

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const duplicateItem = (id: string) =>
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: newItemId() };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });

  const validateStep = (s: number): boolean => {
    if (s === 1) {
      if (!fromOffice || !toOffice) {
        toast.error("Vui lòng chọn VP gửi và VP nhận");
        return false;
      }
      if (!route || !itinerary) {
        toast.error(
          "Không suy ra được tuyến/lộ trình từ VP đã chọn. Kiểm tra điểm lộ trình văn phòng trên hệ thống.",
        );
        return false;
      }
      return true;
    }
    if (s === 2) {
      if (!senderName.trim()) {
        toast.error("Vui lòng nhập tên người gửi");
        return false;
      }
      if (!receiverName.trim()) {
        toast.error("Vui lòng nhập tên người nhận");
        return false;
      }
      if (!isValidVNPhone(senderPhone) || !isValidVNPhone(receiverPhone)) {
        toast.error("SĐT không hợp lệ (VN)");
        return false;
      }
      if (items.some((it) => !it.name.trim())) {
        toast.error("Vui lòng nhập tên hàng hoá cho mỗi kiện");
        return false;
      }
      if (items.some((it) => !(Number(it.weight) >= 1))) {
        toast.error("Mỗi kiện phải có cân nặng tối thiểu 1 kg");
        return false;
      }
      if (!payMethod) {
        toast.error("Vui lòng chọn hình thức thanh toán");
        return false;
      }
      if (ckSender && (!bankName || !bankAccountNo.trim())) {
        toast.error("Vui lòng nhập ngân hàng và số tài khoản nhận thu hộ");
        return false;
      }
      return true;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(LAST_STEP, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!validateStep(1) || !validateStep(2)) return;

    setSaving(true);
    try {
      const { packageCount, goodsLabel } = packagesFromItems(items);
      const goodsTypeEnum = goodsTypeFromName(goodsLabel);
      // Đơn có COD vẫn giữ người trả cước; COD nhận biết qua codAmount.
      const collectForm =
        payMethod === "Người nhận thanh toán" || payMethod === "Thu cước 1 phần" ? "NHAN_TRA" : "GUI_TRA";
      const noteBody = orderNoteWithPackages(undefined, items, goodsFare);
    const now = new Date().toISOString();
      const { isApiEnabled, getToken, isRequestTimeout } = await import("@/lib/api/client");
      const { resolveOfficeCodeStrict } = await import("@/lib/api/sync");
      const fromCode = resolveOfficeCodeStrict(fromOffice) ?? fromOffice;
      const toCode = resolveOfficeCodeStrict(toOffice) ?? toOffice;
      // Cước FE (tổng kiện) là SoT — không ghi đè bằng fareAmount BE (ước lượng theo tổng cân 1 kiện).
      const fare = totalFare;
      const paidForOrder =
        payMethod === "Người gửi thanh toán"
          ? totalFare
          : payMethod === "Thu cước 1 phần"
            ? Math.min(totalFare, Number(prepaid) || 0)
            : 0;

      let orderCode: string;
      if (!isApiEnabled()) {
        toast.error("Chưa kết nối máy chủ — không tạo được đơn");
        return;
      }
      try {
        const { createGuestOrder, patchOrder } = await import("@/lib/api/domain-api");
        const res = await createGuestOrder({
          senderPhone,
          senderName: toUpperName(senderName) || undefined,
          receiverName: toUpperName(receiverName),
          receiverPhone,
          goodsType: goodsTypeEnum,
          paymentTerm: collectForm,
          estimatedWeightKg: totalWeight || undefined,
          homeDelivery: false,
          homePickup: false,
          toOfficeCode: toCode,
          fromOfficeCode: fromCode,
          branchCode: branchCodeOf(route) || undefined,
          routeLabel: route || undefined,
          itineraryLabel: itinerary || undefined,
          note: noteBody || undefined,
          fareAmount: totalFare,
          quantity: packageCount,
          goodsFareAmount: goodsFare,
          pickupFeeAmount: 0,
          deliveryFeeAmount: 0,
          declaredFeeAmount: declaredFee,
          discountAmount: discountVND,
          codAmount: codAmount > 0 ? codAmount : 0,
          codFeeAmount: codAmount > 0 ? codFee : 0,
          bankName: ckSender ? bankName || undefined : undefined,
          bankAccountNo: ckSender ? bankAccountNo.trim() || undefined : undefined,
          bankAccountName: ckSender ? bankAccountName || undefined : undefined,
          goodsPhoto: goodsPhoto || undefined,
        });
        orderCode = res.orderCode;
        if (!orderCode) {
          toast.error("Máy chủ không trả mã đơn");
        return;
      }
        // Best-effort sync phí chi tiết — chỉ khi nhân viên đăng nhập; khách luôn bị 401 nên bỏ qua.
        // Không ghi khoản thu ở đây: cước người gửi trả do người nhập kho gửi thu (BE ghi khi nhập kho).
        if (getToken()) try {
          await patchOrder(orderCode, {
            fareAmount: totalFare,
            goodsFareAmount: goodsFare,
            quantity: packageCount,
            weightKg: totalWeight || undefined,
            pickupFeeAmount: 0,
            deliveryFeeAmount: 0,
            declaredFeeAmount: declaredFee,
            discountAmount: discountVND,
            codAmount: codAmount > 0 ? codAmount : 0,
            codFeeAmount: codAmount > 0 ? codFee : 0,
            note: noteBody || undefined,
            eventAction: "GUEST_FARE_SYNC",
            eventDetail: "Đồng bộ cước theo kiện từ tạo đơn KH",
          });
        } catch {
          /* Biên nhận FE vẫn dùng totalFare / paidForOrder local. */
        }
      } catch (err: unknown) {
        if (isRequestTimeout(err) || err instanceof TypeError) {
          toast.error(
            "Mạng chậm hoặc mất kết nối. Đơn có thể ĐÃ được tạo — vui lòng báo nhân viên quầy kiểm tra trước khi tạo lại.",
            { duration: 15000 },
          );
          return;
        }
        const msg = err instanceof Error ? err.message : "Không tạo được đơn trên máy chủ";
        toast.error(msg);
        return;
    }

    const o: OrderX = {
        code: orderCode,
        senderPhone,
        senderName: toUpperName(senderName),
        receiverName: toUpperName(receiverName) || "—",
        receiverPhone,
        fromOffice: fromCode,
        toOffice: toCode,
        finalToOffice: toCode,
        goodsType: goodsLabel,
        collectForm,
        weightKg: totalWeight || undefined,
        quantity: packageCount,
      fare,
        goodsFare,
        declaredFee,
        discountAmount: discountVND,
        pickupFee: 0,
        deliveryFee: 0,
        homeDelivery: false,
        homePickup: false,
        qrDropOff: true,
        itinerary,
        route,
        branchCode: branchCodeOf(route),
        status: "CONFIRMED",
        createdAt: now,
        updatedAt: now,
        note: noteBody,
        paidAmount: paidForOrder,
        codAmount: codAmount > 0 ? codAmount : 0,
        codFee: codAmount > 0 ? codFee : 0,
        bankName: ckSender ? bankName || undefined : undefined,
        bankAccountNo: ckSender ? bankAccountNo || undefined : undefined,
        bankAccountName: ckSender ? bankAccountName || undefined : undefined,
        events: [{ at: now, by: "customer", action: "CREATE", detail: "Tạo đơn hàng" }],
    };
    addOrder(o, { skipApi: true });
      upsertCustomer(senderPhone, toUpperName(senderName));
      setCreatedOrder(o);
      toast.success("Đã tạo đơn hàng");
    } finally {
      setSaving(false);
    }
  };

  const startNewOrder = () => {
    setPrintLabels(false);
    setCreatedOrder(null);
    setStep(1);
    setRoute("");
    setItinerary("");
    setSenderPhone("");
    setSenderName("");
    setFromOffice(presetValue);
    setReceiverName("");
    setReceiverPhone("");
    setToOffice("");
    setItems([newItem()]);
    setGoodsPhoto("");
    setPayMethod(DEFAULT_PAY_METHOD);
    setPrepaid(0);
    setCodAmount(0);
    setSurchargeExtra(0);
    setCkSender(false);
    setBankName("");
    setBankAccountNo("");
    setBankAccountName("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (createdOrder) {
  return (
      <>
        <GuestOrderBill
          order={createdOrder}
          onHome={() => navigate({ to: "/" })}
          onCreateAnother={startNewOrder}
          onPrintLabels={() => setPrintLabels(true)}
        />
        <PrintLabelDialog
          code={createdOrder.code}
          batchPackages
          open={printLabels}
          onOpenChange={setPrintLabels}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-8 pt-3 sm:max-w-lg md:max-w-xl">
        <header className="relative mb-4 flex items-center justify-center py-2">
          <button
            type="button"
            onClick={goBack}
            className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-black/5"
            aria-label="Quay lại"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="px-10 text-center text-[17px] font-semibold leading-snug text-foreground">
            {headerTitle}
          </h1>
        </header>

        <OrderStepper step={step} />

        <div className="mt-5 flex-1">
          {step === 1 ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <SectionTitle>Chọn VP gửi & VP nhận</SectionTitle>
                <div className="space-y-4">
                  {!masterLoading && offices.length === 0 && (
                    <p className="text-sm text-destructive">
                      Chưa có văn phòng trên hệ thống. Kiểm tra kết nối máy chủ hoặc thử tải lại trang.
                    </p>
                  )}
                  <Field label="VP gửi">
                    <OfficePickerSheet
                      value={fromOffice}
                      onChange={setFromOffice}
                      offices={offices}
                      title="Chọn VP gửi"
                      placeholder={masterLoading ? "Đang tải…" : "Chọn VP gửi"}
                      className={officePickerClass}
                      disabled={masterLoading || offices.length === 0}
                    />
                  </Field>
                  <Field label="VP nhận">
                    <OfficePickerSheet
                      value={toOffice}
                      onChange={setToOffice}
                      offices={toOfficeList}
                      compareOffices={compareGuestDestOffices}
                      title={fromOfficeRec ? `Chọn VP nhận (từ ${fromOfficeRec.name})` : "Chọn VP nhận"}
                      placeholder={
                        masterLoading ? "Đang tải…" : fromOffice ? "Chọn VP nhận" : "Chọn VP gửi trước"
                      }
                      emptyText={
                        fromOfficeRec ? "Không có VP nhận nào có lộ trình từ VP gửi này" : "Không có văn phòng"
                      }
                      className={officePickerClass}
                      disabled={masterLoading || offices.length === 0}
                    />
                  </Field>
                  {fromOffice && toOffice ? (
                    <p className="rounded-xl border border-dashed bg-[#E9EEF5]/60 px-3 py-2 text-xs text-muted-foreground">
                      Tuyến / lộ trình:{" "}
                      <span className="font-medium text-foreground">
                        {route && itinerary ? `${route} · ${itinerary}` : "Chưa khớp được — kiểm tra điểm lộ trình VP"}
                      </span>
                    </p>
                  ) : null}
          </div>
        </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <SectionTitle>Người gửi & nhận</SectionTitle>
                <div className="space-y-5">
                  <PartyBlock
                    title="Người gửi"
                    action={
                      <ContactPickButton
                        onPick={(c) => {
                          if (c.phone) setSenderPhone(c.phone);
                          if (c.name) setSenderName(toUpperName(c.name));
                        }}
                      />
                    }
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="SĐT người gửi">
                        <PhoneInput
                          className={fieldInputClass}
                          placeholder="Nhập SĐT..."
                          value={senderPhone}
                          onChange={setSenderPhone}
                        />
                      </Field>
                      <Field label="Tên người gửi">
                        <NameInput
                          className={fieldInputClass}
                          placeholder="Nhập tên..."
                          value={senderName}
                          onChange={setSenderName}
                        />
                      </Field>
                    </div>
                  </PartyBlock>

                  <div className="h-px bg-border" />

                  <PartyBlock
                    title="Người nhận"
                    action={
                      <ContactPickButton
                        onPick={(c) => {
                          if (c.phone) setReceiverPhone(c.phone);
                          if (c.name) setReceiverName(toUpperName(c.name));
                        }}
                      />
                    }
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="SĐT người nhận">
                        <PhoneInput
                          className={fieldInputClass}
                          placeholder="Nhập SĐT..."
                          value={receiverPhone}
                          onChange={setReceiverPhone}
                        />
                      </Field>
                      <Field label="Tên người nhận">
                        <NameInput
                          className={fieldInputClass}
                          placeholder="Nhập tên..."
                          value={receiverName}
                          onChange={setReceiverName}
                        />
                      </Field>
              </div>
                  </PartyBlock>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <SectionTitle>Hàng hoá</SectionTitle>
                <div className="space-y-4">
                  {items.map((it, idx) => {
                    return (
                      <div key={it.id} className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                            <Package className="h-4 w-4" />
                            Kiện {idx + 1}
                          </div>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Xóa kiện ${idx + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <Field label="Tên hàng hoá *">
                          <Input
                            className={fieldInputClass}
                            placeholder="Nhập tên hàng hóa"
                            value={it.name}
                            onChange={(e) => updateItem(it.id, { name: e.target.value })}
                            required
                          />
                        </Field>

                        <div className="grid grid-cols-3 gap-3">
                          <Field label="Dài (cm)">
                            <NumberInput
                              className={fieldInputClass}
                              value={it.dai}
                              onChange={(dai) => updateItem(it.id, { dai })}
                            />
                          </Field>
                          <Field label="Rộng (cm)">
                            <NumberInput
                              className={fieldInputClass}
                              value={it.rong}
                              onChange={(rong) => updateItem(it.id, { rong })}
                            />
                          </Field>
                          <Field label="Cao (cm)">
                            <NumberInput
                              className={fieldInputClass}
                              value={it.cao}
                              onChange={(cao) => updateItem(it.id, { cao })}
                            />
                          </Field>
              </div>

                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Số lượng">
                            <NumberInput
                              className={fieldInputClass}
                              value={it.sl}
                              onChange={(sl) => updateItem(it.id, { sl })}
                            />
                          </Field>
                          <Field label="Cân nặng (KG)">
                            <NumberInput
                              className={fieldInputClass}
                              decimal
                              min={1}
                              value={it.weight}
                              onChange={(weight) => updateItem(it.id, { weight })}
                            />
                          </Field>
                </div>

                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Giá trị hàng">
                            <MoneyInput
                              className="[&_input]:h-12 [&_input]:rounded-xl [&_input]:border-0 [&_input]:bg-[#E9EEF5] [&_input]:shadow-none"
                              value={it.value}
                              onChange={(value) => updateItem(it.id, { value })}
                              suffix=""
                            />
                          </Field>
                          <Field label="Cước kiện">
                            <MoneyInput
                              className="[&_input]:h-12 [&_input]:rounded-xl [&_input]:border-0 [&_input]:bg-[#E9EEF5] [&_input]:shadow-none [&_input]:text-muted-foreground"
                              value={it.fare}
                              onChange={() => undefined}
                              readOnly
                              tabIndex={-1}
                              suffix=""
                            />
                          </Field>
                  </div>

                        {idx < items.length - 1 && <div className="h-px bg-border" />}
                      </div>
                    );
                  })}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setItems((p) => [...p, newItem()])}
                      className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-primary/40 text-sm font-semibold text-primary hover:bg-primary/5"
                    >
                      <Plus className="h-4 w-4" />
                      Thêm kiện
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const last = items[items.length - 1];
                        if (last) duplicateItem(last.id);
                      }}
                      className="flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 border-primary/40 px-3 text-sm font-semibold text-primary hover:bg-primary/5"
                      aria-label="Nhân bản kiện cuối"
                      title="Nhân bản kiện cuối"
                    >
                      <Copy className="h-4 w-4 shrink-0" />
                      Nhân bản
                    </button>
                  </div>

                  <div className="h-px bg-border" />
                  <GoodsPhotoPicker value={goodsPhoto} onChange={setGoodsPhoto} />
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <SectionTitle>Thanh toán</SectionTitle>
                <div className="space-y-4">
                  <Field label="Hình thức thanh toán">
                      <SearchableSelect
                      value={payMethod}
                      onValueChange={setPayMethod}
                      className={fieldSelectClass}
                      options={PAY_METHODS.map((m) => ({ value: m, label: m }))}
                    />
                  </Field>
                  {payMethod === "Thu cước 1 phần" && (
                    <Field label="Người gửi trả trước">
                      <MoneyInput
                        className="[&_input]:h-12 [&_input]:rounded-xl [&_input]:border-0 [&_input]:bg-[#E9EEF5] [&_input]:shadow-none"
                        value={prepaid}
                        onChange={setPrepaid}
                        suffix=""
                      />
                    </Field>
                  )}
                  <Field label="Thu Hộ (COD)">
                    <MoneyInput
                      className="[&_input]:h-12 [&_input]:rounded-xl [&_input]:border-0 [&_input]:bg-[#E9EEF5] [&_input]:shadow-none"
                      value={codAmount}
                      onChange={setCodAmount}
                      suffix=""
                    />
                  </Field>
                  <label className="flex items-center gap-2.5 text-sm text-foreground">
                    <Checkbox checked={ckSender} onCheckedChange={(v) => setCkSender(Boolean(v))} />
                    Tài khoản nhận thu hộ
                  </label>

                  {ckSender && (
                    <div className="space-y-3 rounded-xl border bg-[#F7F9FC] p-3">
                      <Field label="Ngân hàng">
                        <SearchableSelect
                          value={bankName}
                          onValueChange={setBankName}
                          placeholder="Chọn ngân hàng"
                          className={fieldSelectClass}
                          options={BANK_OPTIONS}
                        />
                      </Field>
                      <Field label="Số tài khoản">
                        <Input
                          className={fieldInputClass}
                          inputMode="numeric"
                          placeholder="Nhập số tài khoản"
                          value={bankAccountNo}
                          onChange={(e) => setBankAccountNo(onlyDigits(e.target.value))}
                        />
                      </Field>
                      <Field label="Tên tài khoản">
                        <NameInput
                          className={fieldInputClass}
                          placeholder="Chủ tài khoản"
                          value={bankAccountName}
                          onChange={setBankAccountName}
                        />
                      </Field>
                  </div>
                )}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 text-sm shadow-sm sm:p-5">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Thông tin thanh toán</div>
                <FeeRow label="Cước hàng" value={goodsFare} always />
                <FeeRow label="Phí thu hộ COD" value={codFee} />
                <FeeRow label="Phí khai báo giá trị" value={declaredFee} />
                <FeeRow label="Đã thu" value={paidNow} />
                <div className="my-3 h-px bg-border" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tổng cước</span>
                  <span className="tabular-nums font-medium">{formatVND(totalFare)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="font-medium">Tổng phải thu</span>
                  <span className="text-base font-bold text-orange-500">{formatVND(unpaid)}</span>
                </div>
              </div>
                  </div>
          )}

          <div className={cn("mt-4 grid gap-3", step > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-primary/40 bg-white text-foreground"
                onClick={() => setStep((s) => s - 1)}
              >
                Quay lại
              </Button>
            )}
            {step < LAST_STEP ? (
              <Button type="button" className="h-12 rounded-xl text-base font-semibold" onClick={goNext}>
                Tiếp tục
              </Button>
            ) : (
              <Button
                type="button"
                className="h-12 rounded-xl text-base font-semibold"
                disabled={saving}
                onClick={() => void submit()}
              >
                {saving ? "Đang tạo..." : "Tạo đơn"}
              </Button>
                )}
              </div>
        </div>
      </div>
    </div>
  );
}

const payLabelOf = guestBillPayLabel;

function GuestOrderBill({
  order,
  onHome,
  onCreateAnother,
  onPrintLabels,
}: {
  order: OrderX;
  onHome: () => void;
  onCreateAnother: () => void;
  onPrintLabels: () => void;
}) {
  const pkgs = packageRows(order);
  const pickup = order.pickupFee ?? 0;
  const delivery = order.deliveryFee ?? 0;
  const codFee = order.codFee ?? 0;
  const declared = order.declaredFee ?? 0;
  const discount = order.discountAmount ?? 0;
  const goodsFare =
    order.goodsFare != null
      ? Number(order.goodsFare)
      : Math.max(0, (order.fare ?? 0) - pickup - delivery - codFee - declared + discount);
  const unpaid = Math.max(0, (order.fare ?? 0) - (order.paidAmount ?? 0));
  const [downloading, setDownloading] = useState(false);
  const [billBlob, setBillBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const payLabel = payLabelOf(order);

  useEffect(() => {
    let cancelled = false;
    setBillBlob(null);
    renderGuestBillPng(order, payLabel)
      .then((b) => {
        if (!cancelled) setBillBlob(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [order, payLabel]);

  const fileName = guestBillFileName(order.code);
  const canShareFile = useMemo(() => {
    if (!billBlob || typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
    try {
      return navigator.canShare({ files: [new File([billBlob], fileName, { type: "image/png" })] });
    } catch {
      return false;
    }
  }, [billBlob, fileName]);

  const saveBill = async () => {
    setDownloading(true);
    try {
      const blob = billBlob ?? (await renderGuestBillPng(order, payLabel));
      if (!isHandheldCameraDevice()) {
        downloadBlob(blob, fileName);
        toast.success("Đã tải biên nhận về máy");
        return;
      }
      setPreviewUrl(await blobToDataUrl(blob));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được biên nhận");
    } finally {
      setDownloading(false);
    }
  };

  const shareBill = async () => {
    if (!billBlob) return;
    const res = await shareImageToGallery(billBlob, fileName);
    if (res === "unsupported") toast.error("Máy không hỗ trợ — hãy nhấn giữ vào ảnh để lưu");
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] px-4 py-5 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-lg print:max-w-none">
        <div className="mb-3 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 print:hidden">
          <div className="text-sm font-semibold text-foreground">Tạo đơn thành công</div>
        </div>

        <div
          id="guest-order-bill"
          className="rounded-2xl border border-[#E5EAF2] bg-white p-4 shadow-sm sm:p-5 print:border-0 print:shadow-none"
        >
          <div className="flex items-start justify-between gap-3 border-b pb-3">
            <div>
              <div className="text-xs font-bold tracking-wide text-primary">X.E VIỆT NAM</div>
              <div className="text-xs text-muted-foreground">Biên nhận đơn hàng</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Mã đơn</div>
              <div className="text-lg font-bold tracking-tight">{order.code}</div>
            </div>
          </div>

          <div className="mt-2 text-xs text-muted-foreground">
            {formatDateTime(order.createdAt)}
            {order.route || order.itinerary
              ? ` · ${[order.route, order.itinerary].filter(Boolean).join(" · ")}`
              : ""}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#E5EAF2] p-3">
              <div className="mb-2 text-xs font-semibold text-primary">Người gửi</div>
              <BillLine label="SĐT" value={order.senderPhone} />
              <BillLine label="Tên" value={order.senderName || "—"} />
              <BillLine label="VP gửi" value={officeName(order.fromOffice)} />
              {order.pickupAddress ? <BillLine label="Địa chỉ" value={order.pickupAddress} /> : null}
              {order.homePickup ? (
                <div className="mt-2 rounded-md bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
                  Lấy tận nơi{pickup > 0 ? ` · ${formatVND(pickup)}` : ""}
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-[#E5EAF2] p-3">
              <div className="mb-2 text-xs font-semibold text-primary">Người nhận</div>
              <BillLine label="SĐT" value={order.receiverPhone} />
              <BillLine label="Tên" value={order.receiverName || "—"} />
              <BillLine label="VP nhận" value={officeName(order.hubOffice || order.toOffice)} />
              {order.address ? <BillLine label="Địa chỉ" value={order.address} /> : null}
              {order.homeDelivery ? (
                <div className="mt-2 rounded-md bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
                  Giao tận nơi{delivery > 0 ? ` · ${formatVND(delivery)}` : ""}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold text-primary">Hàng hoá</div>
            <div className="space-y-2">
              {pkgs.map((p) => (
                <div key={p.seq} className="rounded-xl border border-[#E5EAF2] p-3 text-sm">
                  <div className="mb-1 flex justify-between gap-2 font-medium">
                    <span>KIỆN {p.seq}</span>
                    <span className="tabular-nums text-orange-500">{formatVND(p.fare)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{p.label}</div>
                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                    <span>SL: {p.itemQty}</span>
                    <span>KL: {p.weightKg != null ? Number(p.weightKg).toFixed(1) : "—"} kg</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#E5EAF2] p-3">
            <div className="mb-2 text-xs font-semibold text-primary">Thanh toán</div>
            <BillLine label="Hình thức" value={payLabelOf(order)} />
            {(order.codAmount ?? 0) > 0 ? (
              <BillLine label="Thu hộ COD" value={formatVND(order.codAmount ?? 0)} />
            ) : null}
            <div className="mt-2 space-y-1 border-t pt-2">
              <FeeRow label="Cước hàng" value={goodsFare} always />
              <FeeRow label="Cước lấy hàng tận nơi" value={pickup} />
              <FeeRow label="Cước giao hàng tận nơi" value={delivery} />
              <FeeRow label="Phí thu hộ COD" value={codFee} />
              <FeeRow label="Phí khai báo giá trị" value={declared} />
              <FeeRow label="Giảm giá" value={-discount} />
              <FeeRow label="Đã thu" value={order.paidAmount ?? 0} always />
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">Tổng cước</span>
              <span className="tabular-nums font-medium">{formatVND(order.fare ?? 0)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-sm font-semibold">Tổng phải thu</span>
              <span className="text-base font-bold text-orange-500">{formatVND(unpaid)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 print:hidden sm:grid-cols-2">
          <Button type="button" className="h-12 rounded-xl" onClick={onPrintLabels}>
            <Printer className="mr-2 h-4 w-4" />
            In tem
          </Button>
          <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={onCreateAnother}>
            Tạo đơn khác
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 print:hidden sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-primary/40"
            disabled={downloading}
            onClick={() => void saveBill()}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Đang tạo ảnh…" : "Tải biên nhận"}
          </Button>
          <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={onHome}>
            Về trang chủ
          </Button>
        </div>
        <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
          <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-4">
            <DialogHeader>
              <DialogTitle className="text-base">Lưu biên nhận vào Ảnh</DialogTitle>
            </DialogHeader>
            {canShareFile ? (
              <Button type="button" className="h-12 w-full rounded-xl text-base font-semibold" onClick={() => void shareBill()}>
                <Download className="mr-2 h-4 w-4" />
                Lưu vào Ảnh
              </Button>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {canShareFile ? (
                <>
                  Bấm <b>Lưu vào Ảnh</b> rồi chọn <b>“Lưu hình ảnh”</b>. Hoặc nhấn giữ vào ảnh bên dưới và chọn{" "}
                  <b>“Lưu vào Ảnh”</b> / <b>“Tải hình ảnh xuống”</b>.
                </>
              ) : (
                <>
                  Nhấn giữ vào ảnh bên dưới rồi chọn <b>“Lưu vào Ảnh”</b> / <b>“Tải hình ảnh xuống”</b>. Nếu
                  đang mở trong Zalo/Facebook, hãy mở trang bằng Safari/Chrome để lưu.
                </>
              )}
            </p>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`Biên nhận ${order.code}`}
                className="w-full select-none rounded-xl border"
                style={{ WebkitTouchCallout: "default" }}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function BillLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function FeeRow({ label, value, always }: { label: string; value: number; always?: boolean }) {
  if (!always && !value) return null;
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{formatVND(value)}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h2 className="pb-3 text-base font-semibold text-foreground">{children}</h2>
      <div className="mb-4 h-px bg-border" />
    </>
  );
}

/** Ảnh đơn hàng khách gửi (không bắt buộc, 1 ảnh/đơn): chụp ngay hoặc chọn từ máy. */
function GoodsPhotoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Tệp không phải ảnh");
      return;
    }
    setBusy(true);
    try {
      onChange(await compressToDataUrl(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xử lý được ảnh");
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-primary/40 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-foreground">
        Ảnh đơn hàng <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
      </div>
      {value ? (
        <div className="relative w-fit">
          <img src={value} alt="Ảnh đơn hàng" className="max-h-48 rounded-xl border object-contain" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white"
            aria-label="Xóa ảnh đơn hàng"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy} className={btn} onClick={() => cameraRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {value ? "Chụp lại" : "Chụp ảnh"}
        </button>
        <button type="button" disabled={busy} className={btn} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
          {value ? "Chọn ảnh khác" : "Tải ảnh lên"}
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void pick(e.currentTarget)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pick(e.currentTarget)}
      />
    </div>
  );
}

function OrderStepper({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-2 gap-1">
      {STEPS.map((s, idx) => {
        const active = step >= s.id;
        return (
          <li key={s.id} className="flex flex-col items-center">
            <div className="flex w-full items-center">
              <div
                className={cn(
                  "h-[2px] flex-1",
                  idx === 0 ? "bg-transparent" : active ? "bg-primary" : "bg-[#D5DCE8]",
                )}
                aria-hidden
              />
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                  active ? "bg-primary" : "bg-[#C5CEDD]",
                )}
              >
                {s.id}
              </div>
              <div
                className={cn(
                  "h-[2px] flex-1",
                  idx === STEPS.length - 1 ? "bg-transparent" : step > s.id ? "bg-primary" : "bg-[#D5DCE8]",
                )}
                aria-hidden
              />
            </div>
            <div
              className={cn(
                "mt-1.5 px-0.5 text-center text-[10px] font-medium leading-tight sm:text-[11px]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {s.short}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PartyBlock({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <User className="h-4 w-4 text-primary" />
        {title}
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}
