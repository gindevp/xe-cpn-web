import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Package, Plus, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AddressPicker } from "@/components/AddressPicker";
import { MoneyInput } from "@/components/MoneyInput";
import { NumberInput } from "@/components/NumberInput";
import {
  OTHER_GOODS,
  formatVND,
  goodsTypeFromName,
  officeOptionsForPoint,
  isHnItinerarySide,
  provinceHintFromItinerarySide,
  hnRegionOffices,
} from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import {
  calcCodFee,
  calcDeclaredValueFee,
  calcFare,
  findProductPrice,
  genDraftCode,
  isValidVNPhone,
} from "@/lib/pricing";
import { embedPackageFares, embedPackageGoods, embedPackageItemQtys, embedPackageWeightsKg, splitMoney } from "@/lib/package-label";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/tao-don")({
  head: () => ({
    meta: [
      { title: "Tạo đơn — X.E Việt Nam" },
      { name: "description", content: "Khách tạo đơn nháp qua QR — X.E Việt Nam." },
    ],
  }),
  component: PublicOrderForm,
});

const STEPS = [
  { id: 1, short: "Tuyến & lộ trình" },
  { id: 2, short: "Người gửi & nhận" },
  { id: 3, short: "Hàng hoá" },
  { id: 4, short: "Thanh toán" },
] as const;

/** Giống TaoDonDialog — hình thức thanh toán cước. */
const PAY_METHODS = [
  "Người gửi thanh toán",
  "Người nhận thanh toán",
  "Công nợ",
  "Thu cước 1 phần",
] as const;

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
const onlyLetters = (s: string) => s.replace(/[0-9!@#$%^&*()_+=[\]{};:"\\|<>/?~`]/g, "");
const toUpperName = (s: string) => onlyLetters(s).toLocaleUpperCase("vi-VN");

const fieldSelectClass =
  "h-12 rounded-xl border-0 bg-[#E9EEF5] px-3 shadow-none hover:bg-[#E1E8F2] focus-visible:ring-1 focus-visible:ring-primary";
const fieldInputClass =
  "h-12 rounded-xl border-0 bg-[#E9EEF5] px-3 shadow-none focus-visible:ring-1 focus-visible:ring-primary";

type Item = {
  id: string;
  sl: number;
  kind: string;
  name: string;
  weight: number;
  dai: number;
  rong: number;
  cao: number;
  value: number;
  note: string;
  fare: number;
};

const newItem = (): Item => ({
  id: Math.random().toString(36).slice(2, 9),
  sl: 1,
  kind: "",
  name: "",
  weight: 1,
  dai: 10,
  rong: 10,
  cao: 10,
  value: 0,
  note: "",
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
  return note;
}

function PublicOrderForm() {
  const navigate = useNavigate();
  const offices = useStore((s) => s.offices);
  const profiles = useStore((s) => s.customerProfiles);
  const productPricing = useStore((s) => s.productPricing);
  const pricingRules = useStore((s) => s.pricingRules);
  const addOrder = useStore((s) => s.addOrder);
  const upsertCustomer = useStore((s) => s.upsertCustomer);
  const { branchNames, itinerariesForBranchName, branchCodeOf, findItinerary } =
    useBranchItineraryMaster();

  const [step, setStep] = useState(1);
  const [route, setRoute] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderName, setSenderName] = useState("");
  const [fromOffice, setFromOffice] = useState("");
  const [homePickup, setHomePickup] = useState(false);
  const [pickupAddr, setPickupAddr] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [toOffice, setToOffice] = useState("");
  const [homeDeliver, setHomeDeliver] = useState(false);
  const [deliverAddr, setDeliverAddr] = useState("");
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [payMethod, setPayMethod] = useState<string>(PAY_METHODS[0]);
  const [prepaid, setPrepaid] = useState(0);
  const [codAmount, setCodAmount] = useState(0);
  const [surchargeExtra, setSurchargeExtra] = useState(0);
  const [ckSender, setCkSender] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{ code: string; fare: number } | null>(null);

  const goodsKindOptions = useMemo(() => {
    const names = [...new Set(productPricing.map((p) => p.name.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "vi"),
    );
    return [...names, OTHER_GOODS].map((g) => ({ value: g, label: g }));
  }, [productPricing]);

  useEffect(() => {
    void import("@/lib/api/sync").then((m) => m.syncMasterFromApi()).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!route && branchNames[0]) {
      setRoute(branchNames[0]);
      const opts = itinerariesForBranchName(branchNames[0]);
      if (opts[0]) setItinerary(opts[0]);
    }
  }, [branchNames, itinerariesForBranchName, route]);

  useEffect(() => {
    if (!route) return;
    const opts = itinerariesForBranchName(route);
    if (opts.length && !opts.includes(itinerary)) {
      setItinerary(opts[0] ?? "");
    }
  }, [route, itinerary, itinerariesForBranchName]);

  const selectedItinerary = useMemo(
    () => findItinerary(route, itinerary),
    [findItinerary, route, itinerary],
  );

  const fromIsHn = useMemo(
    () => isHnItinerarySide(selectedItinerary, "from", offices),
    [selectedItinerary, offices],
  );
  const toIsHn = useMemo(
    () => isHnItinerarySide(selectedItinerary, "to", offices),
    [selectedItinerary, offices],
  );

  const pickupProvinceHint = useMemo(
    () => provinceHintFromItinerarySide(selectedItinerary, "from", offices),
    [selectedItinerary, offices],
  );

  const fromOfficeOptions = useMemo(() => {
    if (fromIsHn) {
      return hnRegionOffices(offices).map((o) => ({ value: o.code, label: o.name }));
    }
    return officeOptionsForPoint(offices, selectedItinerary?.departurePoint, fromOffice);
  }, [fromIsHn, offices, selectedItinerary, fromOffice]);

  const toOfficeOptions = useMemo(() => {
    if (toIsHn) {
      return hnRegionOffices(offices).map((o) => ({ value: o.code, label: o.name }));
    }
    return officeOptionsForPoint(offices, selectedItinerary?.destinationPoint, toOffice);
  }, [toIsHn, selectedItinerary, offices, toOffice]);

  useEffect(() => {
    if (!itinerary) {
      setFromOffice("");
      setToOffice("");
      return;
    }
    const it = findItinerary(route, itinerary);
    const hnFrom = isHnItinerarySide(it, "from", offices);
    const hnTo = isHnItinerarySide(it, "to", offices);
    const hnCodes = new Set(hnRegionOffices(offices).map((o) => o.code));

    if (!it) {
      setFromOffice("");
      setToOffice("");
      return;
    }
    if (hnFrom) {
      setFromOffice((cur) => (cur && hnCodes.has(cur) ? cur : ""));
    } else {
      const fromOpts = officeOptionsForPoint(offices, it.departurePoint);
      setFromOffice((cur) => (cur && fromOpts.some((o) => o.value === cur) ? cur : fromOpts[0]?.value ?? ""));
    }
    if (hnTo) {
      setToOffice((cur) => (cur && hnCodes.has(cur) ? cur : ""));
    } else {
      const toOpts = officeOptionsForPoint(offices, it.destinationPoint);
      setToOffice((cur) => (cur && toOpts.some((o) => o.value === cur) ? cur : toOpts[0]?.value ?? ""));
    }
  }, [route, itinerary, offices, findItinerary]);

  useEffect(() => {
    if (isValidVNPhone(senderPhone) && profiles[senderPhone] && !senderName) {
      setSenderName(toUpperName(profiles[senderPhone].name));
      toast.info("Đã tự điền tên gửi từ hồ sơ khách");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderPhone]);

  /** Cước từng kiện — cùng logic TaoDonDialog (bảng giá SP → else cân/kích thước). */
  useEffect(() => {
    setItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        const nameKey = it.kind.trim() === OTHER_GOODS ? it.name.trim() : it.kind.trim();
        const pp = findProductPrice(nameKey);
        const unit = pp ? (pp.price > 0 ? pp.price : pp.currentPrice) : 0;
        let line = 0;
        if (unit > 0) {
          line = Math.round(unit * Math.max(1, Number(it.sl) || 1));
        } else {
          const fare = calcFare({
            route,
            realKg: Number(it.weight) || 0,
            d: it.dai,
            r: it.rong,
            c: it.cao,
          });
          line = fare.base + fare.surcharge;
        }
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

  const serviceFees = useMemo(() => {
    const bd = calcFare({
      route,
      realKg: totalWeight || 1,
      homePickup,
      homeDelivery: homeDeliver,
    });
    return {
      pickupFee: homePickup ? bd.pickupFee : 0,
      deliveryFee: homeDeliver ? bd.deliveryFee : 0,
    };
  }, [route, totalWeight, homePickup, homeDeliver]);

  const pickupFeeVal = serviceFees.pickupFee;
  const deliverFeeVal = serviceFees.deliveryFee;
  const totalFare = Math.max(0, goodsFare + pickupFeeVal + deliverFeeVal + codFee + declaredFee);

  const headerTitle =
    step === 1
      ? "Tạo đơn giao hàng"
      : step === 2
        ? "Thông tin người gửi & nhận"
        : step === 3
          ? "Thông tin hàng hoá"
          : "Thanh toán";

  const cardTitle =
    step === 1
      ? "1. Chọn tuyến & lộ trình"
      : step === 2
        ? "2. Thông tin người gửi & nhận"
        : step === 3
          ? "3. Nhập thông tin hàng hoá"
          : "4. Thông tin thanh toán";

  const goBack = () => {
    if (step > 1) {
      setStep((s) => s - 1);
      return;
    }
    void navigate({ to: "/" });
  };

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const validateStep = (s: number): boolean => {
    if (s === 1) {
      if (!route || !itinerary) {
        toast.error("Vui lòng chọn tuyến và lộ trình");
        return false;
      }
      return true;
    }
    if (s === 2) {
      if (!isValidVNPhone(senderPhone) || !isValidVNPhone(receiverPhone)) {
        toast.error("SĐT không hợp lệ (VN)");
        return false;
      }
      if (!receiverName.trim()) {
        toast.error("Vui lòng nhập tên người nhận");
        return false;
      }
      if (!fromOffice || !toOffice) {
        toast.error("Vui lòng chọn VP gửi và VP nhận");
        return false;
      }
      if (homePickup && !pickupAddr.trim()) {
        toast.error("Lấy tận nơi cần địa chỉ lấy hàng");
        return false;
      }
      if (homeDeliver && !deliverAddr.trim()) {
        toast.error("Giao tận nơi cần địa chỉ giao hàng");
        return false;
      }
      return true;
    }
    if (s === 3) {
      if (items.some((it) => !it.kind.trim())) {
        toast.error("Vui lòng chọn loại hàng cho mỗi kiện");
        return false;
      }
      if (items.some((it) => it.kind === OTHER_GOODS && !it.name.trim())) {
        toast.error("Vui lòng nhập tên hàng hoá (Khác)");
        return false;
      }
      return true;
    }
    if (s === 4) {
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
    setStep((s) => Math.min(4, s + 1));
  };

  const submit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) return;

    setSaving(true);
    try {
      const { packageCount, goodsLabel } = packagesFromItems(items);
      const goodsTypeEnum = goodsTypeFromName(goodsLabel);
      const collectForm =
        codAmount > 0
          ? "COD"
          : payMethod === "Người nhận thanh toán"
            ? "NHAN_TRA"
            : payMethod === "Thu cước 1 phần"
              ? "P50_50"
              : "GUI_TRA";
      const noteBody = orderNoteWithPackages(undefined, items, goodsFare);
      const now = new Date().toISOString();
      const { isApiEnabled } = await import("@/lib/api/client");
      let draftCode = genDraftCode(fromOffice);
      let fare = totalFare;

      if (isApiEnabled()) {
        try {
          const { createDraft } = await import("@/lib/api/domain-api");
          const res = await createDraft({
            senderPhone,
            senderName: senderName || undefined,
            receiverName,
            receiverPhone,
            goodsType: goodsTypeEnum,
            paymentTerm: collectForm,
            estimatedWeightKg: totalWeight || undefined,
            homeDelivery: homeDeliver,
            deliveryAddress: homeDeliver ? deliverAddr : undefined,
            homePickup,
            pickupAddress: homePickup ? pickupAddr || undefined : undefined,
            toOfficeCode: homeDeliver ? undefined : toOffice,
            hubOfficeCode: homeDeliver ? toOffice : undefined,
            fromOfficeCode: fromOffice,
            branchCode: branchCodeOf(route) || undefined,
            note: noteBody || undefined,
          });
          draftCode = res.draftCode || res.orderCode;
          fare = Number(res.fareAmount ?? fare);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Không tạo được đơn nháp trên máy chủ";
          toast.error(msg);
          return;
        }
      }

      const paidNow =
        payMethod === "Người gửi thanh toán"
          ? totalFare
          : payMethod === "Thu cước 1 phần"
            ? Math.min(totalFare, Number(prepaid) || 0)
            : 0;

      const o: OrderX = {
        code: draftCode,
        draftCode,
        senderPhone,
        senderName: toUpperName(senderName),
        receiverName: toUpperName(receiverName) || "—",
        receiverPhone,
        fromOffice,
        toOffice: homeDeliver ? fromOffice : toOffice,
        hubOffice: homeDeliver ? toOffice : undefined,
        address: homeDeliver ? deliverAddr : undefined,
        pickupAddress: homePickup ? pickupAddr : undefined,
        goodsType: goodsLabel,
        collectForm,
        weightKg: totalWeight || undefined,
        quantity: packageCount,
        fare,
        goodsFare,
        declaredFee,
        pickupFee: pickupFeeVal,
        deliveryFee: deliverFeeVal,
        homeDelivery: homeDeliver,
        homePickup,
        itinerary,
        route,
        branchCode: branchCodeOf(route),
        status: "DRAFT",
        createdAt: now,
        updatedAt: now,
        note: noteBody,
        paidAmount: paidNow,
        codAmount: codAmount > 0 ? codAmount : 0,
        codFee: codAmount > 0 ? codFee : 0,
        bankName: ckSender ? bankName || undefined : undefined,
        bankAccountNo: ckSender ? bankAccountNo || undefined : undefined,
        bankAccountName: ckSender ? bankAccountName || undefined : undefined,
        events: [{ at: now, by: "customer", action: "DRAFT_CREATE" }],
      };
      addOrder(o, { skipApi: true });
      upsertCustomer(senderPhone, senderName);
      setDraft({ code: draftCode, fare });
      toast.success("Đã tạo đơn nháp");
    } finally {
      setSaving(false);
    }
  };

  if (draft) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] px-4 py-6">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-success/30 bg-success/10 p-5">
            <div className="text-sm font-medium text-foreground">Đơn nháp đã tạo</div>
            <div className="mt-1 text-xl font-semibold">{draft.code}</div>
            <div className="mt-2 text-sm">
              Cước <span className="text-muted-foreground">(Tạm tính)</span>:{" "}
              <span className="font-semibold">{formatVND(draft.fare)}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Đến quầy X.E để chốt đơn và cân chính xác. Đơn nháp hết hạn sau 24h.
            </p>
            <Button className="mt-4 h-12 w-full rounded-xl" onClick={() => navigate({ to: "/" })}>
              Về trang chủ
            </Button>
          </div>
        </div>
      </div>
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
          {step < 4 ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <h2 className="pb-3 text-base font-semibold text-foreground">{cardTitle}</h2>
              <div className="mb-4 h-px bg-border" />

              {step === 1 && (
                <div className="space-y-4">
                  <Field label="Chọn tuyến">
                    <SearchableSelect
                      value={route}
                      onValueChange={(v) => {
                        setRoute(v);
                        setItinerary(itinerariesForBranchName(v)[0] ?? "");
                      }}
                      placeholder="Chọn tuyến"
                      className={fieldSelectClass}
                      options={branchNames.map((r) => ({ value: r, label: r }))}
                    />
                  </Field>
                  <Field label="Chọn lộ trình">
                    <SearchableSelect
                      value={itinerary}
                      onValueChange={setItinerary}
                      placeholder="Chọn lộ trình"
                      className={fieldSelectClass}
                      options={itinerariesForBranchName(route).map((it) => ({ value: it, label: it }))}
                    />
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <PartyBlock title="Người gửi">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tên người gửi">
                        <Input
                          className={fieldInputClass}
                          placeholder="Nhập tên..."
                          value={senderName}
                          onChange={(e) => setSenderName(toUpperName(e.target.value))}
                        />
                      </Field>
                      <Field label="SĐT người gửi">
                        <Input
                          className={fieldInputClass}
                          inputMode="numeric"
                          placeholder="Nhập SĐT..."
                          value={senderPhone}
                          onChange={(e) => setSenderPhone(onlyDigits(e.target.value))}
                        />
                      </Field>
                    </div>
                    <Field label="Chọn VP gửi">
                      <SearchableSelect
                        value={fromOffice}
                        onValueChange={setFromOffice}
                        placeholder={itinerary ? "Chọn" : "Chọn lộ trình trước"}
                        emptyText={itinerary ? "Không có VP khớp điểm đi" : "Chọn lộ trình trước"}
                        disabled={!itinerary}
                        className={fieldSelectClass}
                        options={fromOfficeOptions}
                      />
                    </Field>
                    <label className="flex items-center gap-2.5 pt-1 text-sm text-foreground">
                      <Checkbox
                        checked={homePickup}
                        onCheckedChange={(v) => setHomePickup(Boolean(v))}
                      />
                      Lấy tận nơi
                    </label>
                    {homePickup && (
                      <AddressPicker
                        label="Địa chỉ người gửi"
                        required
                        value={pickupAddr}
                        onChange={setPickupAddr}
                        preferredProvince={pickupProvinceHint}
                        placeholder="Chọn"
                        triggerClassName="h-12 rounded-xl border-0 bg-[#E9EEF5] hover:bg-[#E1E8F2]"
                      />
                    )}
                  </PartyBlock>

                  <div className="h-px bg-border" />

                  <PartyBlock title="Người nhận">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tên người nhận">
                        <Input
                          className={fieldInputClass}
                          placeholder="Nhập tên..."
                          value={receiverName}
                          onChange={(e) => setReceiverName(toUpperName(e.target.value))}
                        />
                      </Field>
                      <Field label="SĐT người nhận">
                        <Input
                          className={fieldInputClass}
                          inputMode="numeric"
                          placeholder="Nhập SĐT..."
                          value={receiverPhone}
                          onChange={(e) => setReceiverPhone(onlyDigits(e.target.value))}
                        />
                      </Field>
                    </div>
                    <Field label="Chọn VP nhận">
                      <SearchableSelect
                        value={toOffice}
                        onValueChange={setToOffice}
                        placeholder={itinerary ? "Chọn" : "Chọn lộ trình trước"}
                        emptyText={itinerary ? "Không có VP khớp điểm đến" : "Chọn lộ trình trước"}
                        disabled={!itinerary}
                        className={fieldSelectClass}
                        options={toOfficeOptions}
                      />
                    </Field>
                    <label className="flex items-center gap-2.5 pt-1 text-sm text-foreground">
                      <Checkbox
                        checked={homeDeliver}
                        onCheckedChange={(v) => setHomeDeliver(Boolean(v))}
                      />
                      Giao tận nơi
                    </label>
                    {homeDeliver && (
                      <AddressPicker
                        label="Địa chỉ người nhận"
                        required
                        value={deliverAddr}
                        onChange={setDeliverAddr}
                        placeholder="Chọn"
                        triggerClassName="h-12 rounded-xl border-0 bg-[#E9EEF5] hover:bg-[#E1E8F2]"
                      />
                    )}
                  </PartyBlock>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  {items.map((it, idx) => {
                    const isOther = it.kind === OTHER_GOODS;
                    return (
                      <div key={it.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                            <Package className="h-4 w-4" />
                            Kiện {idx + 1}
                          </div>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Xóa kiện ${idx + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <Field label="Loại hàng">
                          <SearchableSelect
                            value={it.kind}
                            onValueChange={(v) =>
                              updateItem(it.id, { kind: v, name: v === OTHER_GOODS ? it.name : "" })
                            }
                            placeholder="Chọn"
                            className={fieldSelectClass}
                            options={goodsKindOptions}
                          />
                        </Field>
                        {isOther && (
                          <Field label="Tên hàng hoá">
                            <Input
                              className={fieldInputClass}
                              placeholder="Nhập tên hàng hóa"
                              value={it.name}
                              onChange={(e) => updateItem(it.id, { name: e.target.value })}
                            />
                          </Field>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Số lượng">
                            <NumberInput
                              className={fieldInputClass}
                              value={it.sl}
                              onChange={(sl) => updateItem(it.id, { sl })}
                            />
                          </Field>
                          <Field label="Cân nặng (kg)">
                            <NumberInput
                              className={fieldInputClass}
                              decimal
                              min={0}
                              value={it.weight}
                              onChange={(weight) => updateItem(it.id, { weight })}
                            />
                          </Field>
                        </div>

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

                        <Field label="Giá trị hàng (VND)">
                          <MoneyInput
                            className="[&_input]:h-12 [&_input]:rounded-xl [&_input]:border-0 [&_input]:bg-[#E9EEF5] [&_input]:shadow-none"
                            value={it.value}
                            onChange={(value) => updateItem(it.id, { value })}
                            suffix=""
                          />
                        </Field>
                        <Field label="Ghi chú (nếu có)">
                          <Input
                            className={fieldInputClass}
                            placeholder="Nhập ghi chú..."
                            value={it.note}
                            onChange={(e) => updateItem(it.id, { note: e.target.value })}
                          />
                        </Field>

                        {idx < items.length - 1 && <div className="h-px bg-border" />}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setItems((p) => [...p, newItem()])}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary/40 text-sm font-semibold text-primary hover:bg-primary/5"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm kiện
                  </button>

                  <div className="flex items-center justify-between border-t pt-3 text-sm">
                    <span className="text-foreground">Cước hàng :</span>
                    <span className="font-semibold text-orange-500">{formatVND(goodsFare)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <h2 className="pb-3 text-base font-semibold text-foreground">{cardTitle}</h2>
                <div className="mb-4 h-px bg-border" />
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
                  <Field label="Thu hộ COD">
                    <MoneyInput
                      className="[&_input]:h-12 [&_input]:rounded-xl [&_input]:border-0 [&_input]:bg-[#E9EEF5] [&_input]:shadow-none"
                      value={codAmount}
                      onChange={setCodAmount}
                      suffix=""
                    />
                  </Field>

                  <label className="flex items-center gap-2.5 text-sm text-foreground">
                    <Checkbox checked={ckSender} onCheckedChange={(v) => setCkSender(Boolean(v))} />
                    Nhận tiền thu hộ qua tài khoản
                  </label>

                  {ckSender && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Tên ngân hàng">
                          <SearchableSelect
                            value={bankName}
                            onValueChange={setBankName}
                            placeholder="Chọn"
                            className={fieldSelectClass}
                            options={BANK_OPTIONS}
                          />
                        </Field>
                        <Field label="Tên chủ tài khoản">
                          <Input
                            className={fieldInputClass}
                            placeholder="Nhập tên..."
                            value={bankAccountName}
                            onChange={(e) => setBankAccountName(toUpperName(e.target.value))}
                          />
                        </Field>
                      </div>
                      <Field label="Số tài khoản">
                        <Input
                          className={fieldInputClass}
                          inputMode="numeric"
                          placeholder="Nhập số tài khoản"
                          value={bankAccountNo}
                          onChange={(e) => setBankAccountNo(onlyDigits(e.target.value))}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 text-sm shadow-sm sm:p-5">
                <FeeRow label="Cước hàng" value={goodsFare} />
                <FeeRow label="Phí thu hộ COD" value={codFee} />
                {homePickup && <FeeRow label="Phí lấy hàng tận nơi" value={pickupFeeVal} />}
                {homeDeliver && <FeeRow label="Phí giao hàng tận nơi" value={deliverFeeVal} />}
                {declaredFee > 0 && <FeeRow label="Phí khai báo giá trị" value={declaredFee} />}
                <div className="my-3 h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="font-medium">Tổng</span>
                  <span className="text-base font-bold text-orange-500">{formatVND(totalFare)}</span>
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
            {step < 4 ? (
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

function FeeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{formatVND(value)}</span>
    </div>
  );
}

function OrderStepper({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1">
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

function PartyBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <User className="h-4 w-4 text-primary" />
        {title}
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
