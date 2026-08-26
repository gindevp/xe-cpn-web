import { useEffect, useMemo, useState } from "react";
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
import { Trash2, Plus, Save, FileText, User, PackagePlus, MapPin, Truck, Receipt, Route as RouteIcon } from "lucide-react";
import { AddressPicker } from "@/components/AddressPicker";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { genOrderCode, calcDeclaredValueFee, calcFare, calcCodFee } from "@/lib/pricing";
import {
  OTHER_GOODS,
  officeOptionsForPoint,
  formatVND,
  branchesForStaffOffice,
  isHnBranch,
  isHnRegionOffice,
  isHnRegionPoint,
  hnRegionOffices,
  canonicalOfficeCode,
} from "@/lib/mock-data";
import { MoneyInput } from "@/components/MoneyInput";
import { embedPackageFares, embedPackageGoods, embedPackageItemQtys, embedPackageWeightsKg, embedWarehouseInSeqs, splitMoney, warehouseInSeqs } from "@/lib/package-label";
import { cn } from "@/lib/utils";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { resolveOfficeCode } from "@/lib/api/sync";
import { useAuth } from "@/lib/auth";
import { assignedOfficeCode, hasAllOfficeScope } from "@/lib/office-scope";

type Item = {
  id: string;
  sl: number;
  /** Loại hàng — chọn từ bảng giá theo sản phẩm, hoặc "Khác". */
  kind: string;
  /** Tên hàng tự nhập — chỉ dùng khi loại hàng là "Khác". */
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

const onlyLetters = (s: string) => s.replace(/[0-9!@#$%^&*()_+=[\]{};:"\\|<>/?~`]/g, "");

/** Cước từng kiện = cước dòng (1 dòng = 1 kiện) + chia đều phí đơn, tổng = totalFare. */
function faresPerPackage(items: Item[], totalFare: number): number[] {
  const n = items.length || 1;
  const goods = items.map((i) => Math.round(Number(i.fare) || 0));
  const goodsSum = goods.reduce((s, v) => s + v, 0);
  const extras = Math.max(0, Math.round(Number(totalFare) || 0) - goodsSum);
  const extraParts = splitMoney(extras, n);
  return goods.map((g, i) => g + (extraParts[i] ?? 0));
}

function orderNoteWithPackages(body: string | undefined, items: Item[], totalFare: number) {
  const qtys = items.map((i) => Math.max(1, Number(i.sl) || 1));
  const weights = items.map((i) => Math.max(0, Number(i.weight) || 0));
  const { goodsKinds, goodsNames } = packagesFromItems(items);
  let note = embedPackageGoods(body, goodsKinds, goodsNames);
  note = embedPackageFares(note, faresPerPackage(items, totalFare));
  note = embedPackageItemQtys(note, qtys);
  note = embedPackageWeightsKg(note, weights);
  return note;
}

/** Mỗi dòng hàng = 1 kiện; SL = số lượng SP trong kiện (khai báo). */
function packagesFromItems(items: Item[]) {
  const packageCount = Math.max(1, items.length);
  const goodsKinds = items.map((i) => i.kind.trim() || "Hàng hoá");
  const goodsNames = items.map((i) => (i.kind.trim() === OTHER_GOODS ? i.name.trim() : ""));
  return { packageCount, goodsKinds, goodsNames, goodsLabel: goodsKinds.join(", ") };
}

const newItem = (): Item => ({
  id: Math.random().toString(36).slice(2, 9),
  sl: 1,
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
  payMethod?: string;
  prepaid?: number;
  ckSender?: boolean;

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
  const productPricing = useStore((s) => s.productPricing);

  const staffOfficeCode = useMemo(() => {
    const raw = assignedOfficeCode(session?.office);
    return canonicalOfficeCode(raw) || raw;
  }, [session?.office]);
  const staffOffice = useMemo(
    () => offices.find((o) => o.code === staffOfficeCode || o.name === staffOfficeCode),
    [offices, staffOfficeCode],
  );
  const staffIsHn = Boolean(staffOffice && isHnRegionOffice(staffOffice));
  const scopeAll = hasAllOfficeScope(session);

  const allowedBranchNames = useMemo(() => {
    if (scopeAll || staffIsHn || !staffOfficeCode) return branchNames;
    return branchesForStaffOffice(branchNames, staffOfficeCode, offices, itineraries);
  }, [scopeAll, staffIsHn, staffOfficeCode, branchNames, offices, itineraries]);

  /** Loại hàng lấy từ Bảng giá → Giá theo sản phẩm; "Khác" luôn có để tự nhập tên. */
  const goodsKindOptions = useMemo(() => {
    const names = [...new Set(productPricing.map((p) => p.name.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "vi"),
    );
    return [...names, OTHER_GOODS].map((g) => ({ value: g, label: g }));
  }, [productPricing]);
  const defaultBranch = initial?.route ?? allowedBranchNames[0] ?? "";
  const [route, setRoute] = useState<string>(defaultBranch);
  const [itinerary, setItinerary] = useState<string>(
    initial?.itinerary ?? "",
  );
  // Sender
  const [senderPhone, setSenderPhone] = useState(initial?.senderPhone ?? "");
  const [senderName, setSenderName] = useState(initial?.senderName ?? "");
  const [fromOffice, setFromOffice] = useState(initial?.fromOffice ?? "");
  const [homePickup, setHomePickup] = useState(initial?.homePickup ?? false);
  const [pickupAddr, setPickupAddr] = useState(initial?.pickupAddr ?? "");
  const [pickupFee, setPickupFee] = useState(initial?.pickupFee ?? 0);
  // Receiver
  const [receiverPhone, setReceiverPhone] = useState(initial?.receiverPhone ?? "");
  const [receiverName, setReceiverName] = useState(initial?.receiverName ?? "");
  const [toOffice, setToOffice] = useState(initial?.toOffice ?? "");
  const [idNumber, setIdNumber] = useState(initial?.idNumber ?? "");
  const [homeDeliver, setHomeDeliver] = useState(initial?.homeDeliver ?? false);
  const [deliverAddr, setDeliverAddr] = useState(initial?.deliverAddr ?? "");
  const [deliverDate, setDeliverDate] = useState(initial?.deliverDate ?? "");
  const [deliverFee, setDeliverFee] = useState(initial?.deliverFee ?? 0);
  // Items
  const [items, setItems] = useState<Item[]>(initial?.items ?? [newItem()]);
  // Payment
  const [orderNote, setOrderNote] = useState(initial?.orderNote ?? "");
  const [codAmount, setCodAmount] = useState(initial?.codAmount ?? 0);
  const [ckSender, setCkSender] = useState(initial?.ckSender ?? false);
  const [bankName, setBankName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [surchargeExtra, setSurchargeExtra] = useState(initial?.surchargeExtra ?? 0);
  const [prepaid, setPrepaid] = useState(initial?.prepaid ?? 0);
  const [payMethod, setPayMethod] = useState(initial?.payMethod ?? PAY_METHODS[0]);


  // When reopening in edit mode with different initial, resync fields.
  useEffect(() => {
    if (!open || !initial) return;
    const br = initial.route ?? allowedBranchNames[0] ?? "";
    setRoute(br);
    setItinerary(initial.itinerary ?? itinerariesForBranchName(br)[0] ?? "");
    setSenderPhone(initial.senderPhone ?? "");
    setSenderName(initial.senderName ?? "");
    setFromOffice(initial.fromOffice ?? "");
    setHomePickup(initial.homePickup ?? false);
    setPickupAddr(initial.pickupAddr ?? "");
    setPickupFee(initial.pickupFee ?? 0);
    setReceiverPhone(initial.receiverPhone ?? "");
    setReceiverName(initial.receiverName ?? "");
    setToOffice(initial.toOffice ?? "");
    setIdNumber(initial.idNumber ?? "");
    setHomeDeliver(initial.homeDeliver ?? false);
    setDeliverAddr(initial.deliverAddr ?? "");
    setDeliverDate(initial.deliverDate ?? "");
    setDeliverFee(initial.deliverFee ?? 0);
    setItems(initial.items && initial.items.length ? initial.items : [newItem()]);
    setOrderNote(initial.orderNote ?? "");
    setCodAmount(initial.codAmount ?? 0);
    setCkSender(initial.ckSender ?? false);
    setSurchargeExtra(initial.surchargeExtra ?? 0);
    setPrepaid(initial.prepaid ?? 0);
    setPayMethod(initial.payMethod ?? PAY_METHODS[0]);
  }, [open, initial, allowedBranchNames, itinerariesForBranchName]);

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

  const routeIsHn = useMemo(
    () => isHnBranch(route, itineraries, offices),
    [route, itineraries, offices],
  );

  const lockFromToStaffOffice = Boolean(staffOfficeCode && !staffIsHn && !scopeAll);

  const fromOfficeOptions = useMemo(() => {
    if (lockFromToStaffOffice && staffOffice) {
      return [{ value: staffOffice.code, label: staffOffice.name }];
    }
    if (routeIsHn) {
      return hnRegionOffices(offices).map((o) => ({ value: o.code, label: o.name }));
    }
    return officeOptionsForPoint(offices, selectedItinerary?.departurePoint, fromOffice);
  }, [
    lockFromToStaffOffice,
    staffOffice,
    routeIsHn,
    offices,
    selectedItinerary,
    fromOffice,
  ]);

  const toOfficeOptions = useMemo(() => {
    const dest = selectedItinerary?.destinationPoint;
    if (routeIsHn || isHnRegionPoint(dest, offices)) {
      return hnRegionOffices(offices).map((o) => ({ value: o.code, label: o.name }));
    }
    return officeOptionsForPoint(offices, dest, toOffice);
  }, [routeIsHn, selectedItinerary, offices, toOffice]);

  const fillOfficesFromItinerary = (branchName: string, itineraryName: string) => {
    const it = findItinerary(branchName, itineraryName);
    const hnRoute = isHnBranch(branchName, itineraries, offices);

    if (lockFromToStaffOffice && staffOffice) {
      setFromOffice(staffOffice.code);
    } else if (!it) {
      setFromOffice("");
    } else if (hnRoute) {
      const hnCodes = new Set(hnRegionOffices(offices).map((o) => o.code));
      setFromOffice((cur) => (cur && hnCodes.has(cur) ? cur : ""));
    } else {
      const fromOpts = officeOptionsForPoint(offices, it.departurePoint);
      setFromOffice((cur) => (cur && fromOpts.some((o) => o.value === cur) ? cur : fromOpts[0]?.value ?? ""));
    }

    if (!it) {
      setToOffice("");
      return;
    }
    if (hnRoute || isHnRegionPoint(it.destinationPoint, offices)) {
      const hnCodes = new Set(hnRegionOffices(offices).map((o) => o.code));
      setToOffice((cur) => (cur && hnCodes.has(cur) ? cur : ""));
    } else {
      const toOpts = officeOptionsForPoint(offices, it.destinationPoint);
      setToOffice((cur) => (cur && toOpts.some((o) => o.value === cur) ? cur : toOpts[0]?.value ?? ""));
    }
  };

  // Create mode: VP gửi/nhận follow lộ trình + quyền VP tài khoản
  useEffect(() => {
    if (!open || initial) return;
    fillOfficesFromItinerary(route, itinerary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, route, itinerary, offices, findItinerary, staffOfficeCode, lockFromToStaffOffice]);


  const goodsFare = items.reduce((s, i) => s + (Number(i.fare) || 0), 0);
  const codFee = codAmount > 0 ? Number(surchargeExtra || 0) : 0;
  const pickupFeeVal = homePickup ? Number(pickupFee || 0) : 0;
  const deliverFeeVal = homeDeliver ? Number(deliverFee || 0) : 0;
  const declaredValue = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
  const declaredFee = calcDeclaredValueFee(declaredValue);
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
        const fare = calcFare({
          route,
          realKg: Number(it.weight) || 0,
          d: it.dai,
          r: it.rong,
          c: it.cao,
        });
        const line = fare.base + fare.surcharge;
        if (it.fare === line) return it;
        changed = true;
        return { ...it, fare: line };
      });
      return changed ? next : prev;
    });
  }, [route, items, pricingRules]);


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
    setSurchargeExtra(0);
    setPrepaid(0);

    setPickupFee(0);
    setDeliverFee(0);
  };

  const addOrder = useStore((s) => s.addOrder);
  const updateOrder = useStore((s) => s.updateOrder);
  const [saving, setSaving] = useState(false);

  const submit = async (action: "draft" | "save" | "print") => {
    if (saving) return;
    if (!senderPhone || !receiverPhone) {
      toast.error("Vui lòng nhập SĐT người gửi và người nhận");
      return;
    }
    if (!pickupAddr) {
      toast.error("Vui lòng nhập địa chỉ người gửi");
      return;
    }
    if (homeDeliver && !deliverAddr) {
      toast.error("Vui lòng nhập địa chỉ giao hàng");
      return;
    }
    if (!fromOffice || !toOffice) {
      toast.error("Vui lòng chọn VP gửi và VP nhận");
      return;
    }
    if (!offices.length) {
      toast.error("Danh sách văn phòng chưa tải xong — vui lòng đợi vài giây rồi thử lại");
      return;
    }
    if (mode === "edit") {
      if (initial?.code) {
        const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
        const { packageCount } = packagesFromItems(items);
        const fromCode = resolveOfficeCode(fromOffice);
        const destCode = resolveOfficeCode(toOffice);
        updateOrder(initial.code, {
          senderPhone,
          senderName,
          receiverName: receiverName || "—",
          receiverPhone,
          fromOffice: fromCode,
          toOffice: destCode,
          note: embedWarehouseInSeqs(
            orderNoteWithPackages(orderNote, items, totalFare),
            warehouseInSeqs(useStore.getState().orders.find((o) => o.code === initial.code) ?? { note: undefined }),
          ),
          weightKg: totalWeight,
          quantity: packageCount,
          fare: totalFare,
          pickupAddress: pickupAddr || undefined,
          address: deliverAddr || undefined,
          homeDelivery: homeDeliver,
          homePickup,
        });
      }
      toast.success(`Đã cập nhật đơn hàng${initial?.code ? ` ${initial.code}` : ""}`);
      onOpenChange(false);
      return;
    }

    const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
    const { packageCount, goodsLabel } = packagesFromItems(items);
    const code = genOrderCode(fromOffice.replace(/\s+/g, "").slice(-4).toUpperCase() || "XX");
    const now = new Date().toISOString();

    setSaving(true);
    try {
      const result = await addOrder({
        code,
        senderPhone,
        senderName,
        receiverName: receiverName || "—",
        receiverPhone,
        fromOffice,
        toOffice,
        goodsType: goodsLabel,
        collectForm: codAmount > 0 ? "COD" : "",
        weightKg: totalWeight,
        quantity: packageCount,
        fare: totalFare,
        pickupFee: Number(pickupFee) || 0,
        deliveryFee: Number(deliverFee) || 0,
        route,
        itinerary,
        branchCode: branchCodeOf(route),
        status: action === "draft" ? "DRAFT" : "CONFIRMED",
        createdAt: now,
        updatedAt: now,
        note: orderNoteWithPackages(orderNote, items, totalFare),
        homeDelivery: homeDeliver,
        homePickup,
        paidAmount: paidNow,
        pickupAddress: pickupAddr || undefined,
        address: deliverAddr || undefined,
        codAmount: codAmount > 0 ? codAmount : 0,
        codFee: codAmount > 0 ? codFee : 0,
        bankName: bankName || undefined,
        bankAccountNo: bankAccountNo || undefined,
        bankAccountName: bankAccountName || undefined,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const savedCode = result.code;
      if (action === "draft") toast.success(`Đã lưu nháp đơn ${savedCode}`);
      else if (action === "print") toast.success(`Đã lưu và gửi lệnh in ${savedCode}`);
      else toast.success(`Đã lưu đơn ${savedCode}`);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };


  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  return (
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <F label="SĐT Người Gửi *">
                <Input inputMode="numeric" placeholder="VD: 0371234567" value={senderPhone} onChange={(e) => setSenderPhone(onlyDigits(e.target.value))} />
              </F>
              <F label="Tên người gửi">
                <Input placeholder="Tên người gửi" value={senderName} onChange={(e) => setSenderName(onlyLetters(e.target.value))} />

              </F>
              <F label="VP gửi *">
                <SearchableSelect
                  value={fromOffice}
                  onValueChange={setFromOffice}
                  className="h-9"
                  placeholder={itinerary ? "Chọn VP gửi" : "Chọn lộ trình trước"}
                  emptyText={itinerary ? "Không có VP khớp điểm đi" : "Chọn lộ trình trước"}
                  disabled={!itinerary || lockFromToStaffOffice}
                  options={fromOfficeOptions}
                />
              </F>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr] md:items-end">
              <label className="flex items-center gap-2 whitespace-nowrap pb-2.5 text-sm">
                <Checkbox checked={homePickup} onCheckedChange={(v) => setHomePickup(Boolean(v))} />
                <MapPin className="h-3.5 w-3.5 text-success" />
                Lấy tận nơi
              </label>
              <AddressPicker label="Địa chỉ người gửi" required value={pickupAddr} onChange={setPickupAddr} />
            </div>

          </Section>

          {/* Receiver section */}
          <Section icon={<Truck className="h-4 w-4" />} title="Người nhận">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <F label="SĐT Người Nhận *">
                <Input inputMode="numeric" placeholder="VD: 0377654321" value={receiverPhone} onChange={(e) => setReceiverPhone(onlyDigits(e.target.value))} />
              </F>
              <F label="Tên người nhận">
                <Input placeholder="Tên người nhận" value={receiverName} onChange={(e) => setReceiverName(onlyLetters(e.target.value))} />

              </F>
              <F label="VP Nhận *">
                <SearchableSelect
                  value={toOffice}
                  onValueChange={setToOffice}
                  className="h-9"
                  placeholder={itinerary ? "Chọn VP nhận" : "Chọn lộ trình trước"}
                  emptyText={itinerary ? "Không có VP khớp điểm đến" : "Chọn lộ trình trước"}
                  disabled={!itinerary}
                  options={toOfficeOptions}
                />
              </F>
              <F label="CMND/Passport">
                <Input placeholder="VD: 191943210" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
              </F>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr] md:items-end">
              <label className="flex items-center gap-2 whitespace-nowrap pb-2.5 text-sm">
                <Checkbox checked={homeDeliver} onCheckedChange={(v) => setHomeDeliver(Boolean(v))} />
                <MapPin className="h-3.5 w-3.5 text-success" />
                Giao tận nơi
              </label>
              <AddressPicker label="Địa chỉ người nhận" required={homeDeliver} value={deliverAddr} onChange={setDeliverAddr} />
            </div>

          </Section>

          {/* Items table */}
          <Section icon={<PackagePlus className="h-4 w-4" />} title="Danh sách hàng hóa">
            <div className="space-y-3">
              {items.map((it, idx) => {
                const isOther = it.kind === OTHER_GOODS;
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
                    {/* Row 1: loại hàng · [tên hàng] · dài · rộng · cao */}
                    <div className="grid gap-3" style={{ gridTemplateColumns: isOther ? "1fr 1fr 68px 68px 68px" : "1fr 68px 68px 68px" }}>
                      <F label="Chọn loại hàng">
                        <SearchableSelect
                          value={it.kind}
                          onValueChange={(v) => updateItem(it.id, { kind: v, name: v === OTHER_GOODS ? it.name : "" })}
                          className="h-9"
                          placeholder="Chọn loại hàng"
                          options={goodsKindOptions}
                        />
                      </F>
                      {isOther && (
                        <F label="Nhập tên hàng hoá">
                          <Input
                            className="h-9"
                            placeholder="Nhập tên hàng hóa"
                            value={it.name}
                            onChange={(e) => updateItem(it.id, { name: e.target.value })}
                          />
                        </F>
                      )}
                      <F label="Dài (cm)">
                        <Input className="h-9 w-full" type="number" placeholder="0" value={it.dai} onChange={(e) => updateItem(it.id, { dai: Number(e.target.value) || 0 })} />
                      </F>
                      <F label="Rộng (cm)">
                        <Input className="h-9 w-full" type="number" placeholder="0" value={it.rong} onChange={(e) => updateItem(it.id, { rong: Number(e.target.value) || 0 })} />
                      </F>
                      <F label="Cao (cm)">
                        <Input className="h-9 w-full" type="number" placeholder="0" value={it.cao} onChange={(e) => updateItem(it.id, { cao: Number(e.target.value) || 0 })} />
                      </F>
                    </div>
                    {/* Row 2: số lượng · cân nặng · giá trị · cước · ghi chú */}
                    <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: "72px 90px 1fr 1fr 2fr" }}>
                      <F label="Số lượng">
                        <Input className="h-9 w-full" type="number" value={it.sl} onChange={(e) => updateItem(it.id, { sl: Number(e.target.value) || 0 })} />
                      </F>
                      <F label="Cân nặng (KG)">
                        <Input
                          className="h-9 w-full"
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={it.weight}
                          onChange={(e) => updateItem(it.id, { weight: Number(e.target.value) || 0 })}
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


                <F label="Ghi chú đơn hàng">
                  <Textarea rows={3} placeholder="Nhập ghi chú" value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
                </F>
              </div>

              {/* RIGHT: Summary */}
              <div>
                <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Thông tin thanh toán</div>
                  <Row label="Cước hàng" value={goodsFare} />
                  <Row label="Cước lấy hàng tận nơi" value={pickupFeeVal} />
                  <Row label="Cước giao hàng tận nơi" value={deliverFeeVal} />
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
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void submit("draft")} disabled={saving}>
              <FileText className="h-3.5 w-3.5" /> {saving ? "Đang lưu…" : "Lưu nháp"}
            </Button>
            <Button size="sm" variant="destructive" className="gap-1.5" onClick={clear} disabled={saving}>
              <Trash2 className="h-3.5 w-3.5" /> Xóa
            </Button>
            <Button size="sm" className="gap-1.5 bg-primary" onClick={() => void submit("save")} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Đang lưu…" : "Tạo đơn"}
            </Button>
          </>
        )}
      </div>

      </DialogContent>
    </Dialog>
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

function Row({ label, value }: { label: string; value: number }) {
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
