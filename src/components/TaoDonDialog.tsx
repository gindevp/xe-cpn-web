import { useEffect, useState } from "react";
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
import { Trash2, Plus, Save, Printer, FileText, User, PackagePlus, MapPin, Truck, Receipt, Route as RouteIcon } from "lucide-react";
import { AddressPicker } from "@/components/AddressPicker";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { genOrderCode, calcDeclaredValueFee } from "@/lib/pricing";
import { needsHubTransit, HN_HUB_NAME, type OrderLeg } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { FALLBACK_BRANCHES, useBranchItineraryMaster } from "@/lib/use-branch-itinerary";

const DEFAULT_FARE = 35000;

type Item = {
  id: string;
  sl: number;
  name: string;
  weight: number;
  dai: number;
  rong: number;
  cao: number;
  value: number;
  note: string;
  fare: number;
};

/** Danh mục tên hàng mặc định */
const GOODS_NAMES = [
  "Bưu kiện",
  "Tài liệu / Giấy tờ",
  "Quần áo",
  "Thực phẩm khô",
  "Đồ điện tử",
  "Đồ gia dụng",
  "Linh kiện / Phụ tùng",
  "Mỹ phẩm",
  "Thuốc / Y tế",
  "Hàng dễ vỡ",
  "Hàng cồng kềnh",
  "Khác",
];

const onlyDigits = (s: string) => s.replace(/[^\d]/g, "");

/** Hình thức thanh toán */
const PAY_METHODS = [
  "Người gửi thanh toán",
  "Người nhận thanh toán",
  "Công nợ",
  "Thu cước 1 phần",
];

/** Giảm giá do hệ thống áp theo chính sách (không cho sửa tay) */
function systemDiscount(subtotal: number) {
  if (subtotal >= 1000000) return Math.round(subtotal * 0.1);
  if (subtotal >= 500000) return Math.round(subtotal * 0.05);
  return 0;
}

const onlyLetters = (s: string) => s.replace(/[0-9!@#$%^&*()_+=[\]{};:"\\|<>/?~`]/g, "");


const OFFICES = [
  "VP Ngọc Hồi",
  "VP Lê Duẩn",
  "VP Phố Vọng",
  "VP Trần Đại Nghĩa",
  "VP Giải Phóng",
  "VP Hà Đông",
  "VP BigC",
  "VP Ninh Bình",
  "VP Nam Định",
  "VP 104 Song Hào - NĐ",
  "VP Thái Bình",
  "VP Phú Thọ",
  "VP Việt Trì",
  "VP Yên Bái 1",
  "VP Yên Bái 3",
];

const newItem = (): Item => ({
  id: Math.random().toString(36).slice(2, 9),
  sl: 1,
  name: "",
  weight: 0,
  dai: 10,
  rong: 10,
  cao: 10,
  value: 0,

  note: "",
  fare: DEFAULT_FARE,
});

export type TaoDonInitial = {
  code?: string;
  dealer?: string;
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
  const { branchNames, itinerariesForBranchName } = useBranchItineraryMaster();
  const defaultBranch = initial?.route ?? branchNames[0] ?? FALLBACK_BRANCHES[0];
  const [dealer, setDealer] = useState(initial?.dealer ?? "Đơn nhà xe");
  const [route, setRoute] = useState<string>(defaultBranch);
  const [itinerary, setItinerary] = useState<string>(
    initial?.itinerary ?? "",
  );
  // Sender
  const [senderPhone, setSenderPhone] = useState(initial?.senderPhone ?? "");
  const [senderName, setSenderName] = useState(initial?.senderName ?? "");
  const [fromOffice, setFromOffice] = useState(initial?.fromOffice ?? "VP BigC");
  const [homePickup, setHomePickup] = useState(initial?.homePickup ?? false);
  const [pickupAddr, setPickupAddr] = useState(initial?.pickupAddr ?? "");
  const [pickupFee, setPickupFee] = useState(initial?.pickupFee ?? 0);
  // Receiver
  const [receiverPhone, setReceiverPhone] = useState(initial?.receiverPhone ?? "");
  const [receiverName, setReceiverName] = useState(initial?.receiverName ?? "");
  const [toOffice, setToOffice] = useState(initial?.toOffice ?? "VP Ninh Bình");
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
    setDealer(initial.dealer ?? "Đơn nhà xe");
    const br = initial.route ?? branchNames[0] ?? FALLBACK_BRANCHES[0];
    setRoute(br);
    setItinerary(initial.itinerary ?? itinerariesForBranchName(br)[0] ?? "");
    setSenderPhone(initial.senderPhone ?? "");
    setSenderName(initial.senderName ?? "");
    setFromOffice(initial.fromOffice ?? "VP BigC");
    setHomePickup(initial.homePickup ?? false);
    setPickupAddr(initial.pickupAddr ?? "");
    setPickupFee(initial.pickupFee ?? 0);
    setReceiverPhone(initial.receiverPhone ?? "");
    setReceiverName(initial.receiverName ?? "");
    setToOffice(initial.toOffice ?? "VP Ninh Bình");
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

  }, [open, initial, branchNames, itinerariesForBranchName]);

  // After master load: default itinerary when create mode has empty itinerary
  useEffect(() => {
    if (!open || initial) return;
    if (!route && branchNames[0]) setRoute(branchNames[0]);
    const opts = itinerariesForBranchName(route || branchNames[0]);
    if (!itinerary && opts[0]) setItinerary(opts[0]);
  }, [open, initial, branchNames, itinerariesForBranchName, route, itinerary]);


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
  useEffect(() => { if (!codAmount) setSurchargeExtra(0); }, [codAmount]);


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

  const submit = (action: "draft" | "save" | "print") => {
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
    if (mode === "edit") {
      if (initial?.code) {
        const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
        const totalQty = items.reduce((s, i) => s + (Number(i.sl) || 0), 0);
        updateOrder(initial.code, {
          senderPhone,
          senderName,
          receiverName: receiverName || "—",
          receiverPhone,
          note: orderNote,
          weightKg: totalWeight,
          quantity: totalQty || 1,
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
    const totalQty = items.reduce((s, i) => s + (Number(i.sl) || 0), 0);
    const goodsName = items.map((i) => i.name).filter(Boolean).join(", ") || "Hàng hoá";
    const code = genOrderCode(fromOffice.replace(/\s+/g, "").slice(-4).toUpperCase() || "XX");
    const now = new Date().toISOString();

    // Tỉnh↔tỉnh: tự động sinh 2 chặng qua hub HN. Các đơn có 1 đầu là HN vẫn 1 chặng như cũ.
    const multiLeg = needsHubTransit(fromOffice, toOffice);
    const legs: OrderLeg[] | undefined = multiLeg
      ? [
          { index: 0, fromOffice, toOffice: HN_HUB_NAME, status: "PENDING" },
          { index: 1, fromOffice: HN_HUB_NAME, toOffice, status: "PENDING" },
        ]
      : undefined;
    const orderFromOffice = multiLeg ? fromOffice : fromOffice;
    const orderToOffice = multiLeg ? HN_HUB_NAME : toOffice;

    addOrder({
      code,
      senderPhone,
      senderName,
      receiverName: receiverName || "—",
      receiverPhone,
      fromOffice: orderFromOffice,
      toOffice: orderToOffice,
      hubOffice: multiLeg ? HN_HUB_NAME : undefined,
      finalToOffice: multiLeg ? toOffice : undefined,
      legs,
      currentLegIndex: multiLeg ? 0 : undefined,
      goodsType: goodsName,
      collectForm: codAmount > 0 ? "COD" : "",
      weightKg: totalWeight,
      quantity: totalQty || 1,
      fare: totalFare,
      pickupFee: Number(pickupFee) || 0,
      deliveryFee: Number(deliverFee) || 0,
      status: action === "draft" ? "DRAFT" : "CONFIRMED",
      createdAt: now,
      updatedAt: now,
      note: orderNote,
      homeDelivery: homeDeliver,
      homePickup,
      paidAmount: paidNow,
      // AddressPicker (new/old mode) → same string fields; must be on create as well as edit
      pickupAddress: pickupAddr || undefined,
      address: deliverAddr || undefined,
    });

    if (action === "draft") toast.success(`Đã lưu nháp đơn ${code}`);
    else if (action === "print") toast.success(`Đã lưu và gửi lệnh in ${code}`);
    else toast.success(`Đã lưu đơn ${code}`);
    onOpenChange(false);
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
            {/* Đại lý */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
            <F label="Đại lý *" labelClassName="flex h-4 items-center">
              <SearchableSelect
                value={dealer}
                onValueChange={setDealer}
                className="h-9 items-center py-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                options={[
                  { value: "Đơn nhà xe", label: "Đơn nhà xe" },
                  { value: "Đại lý A", label: "Đại lý A" },
                  { value: "Đại lý B", label: "Đại lý B" },
                ]}
              />
            </F>
            <F label={<span className="flex items-center gap-1"><RouteIcon className="h-3 w-3 shrink-0" />Chọn tuyến *</span>} labelClassName="flex h-4 items-center">
              <SearchableSelect
                value={route}
                onValueChange={(v) => {
                  setRoute(v);
                  setItinerary(itinerariesForBranchName(v)[0] ?? "");
                }}
                className="h-9 items-center py-0"
                placeholder="Chọn tuyến"
                options={branchNames.map((r) => ({ value: r, label: r }))}
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
                  options={OFFICES.map((o) => ({ value: o, label: o }))}
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
                  options={OFFICES.map((o) => ({ value: o, label: o }))}
                />
              </F>
              <F label="CMND/Passport">
                <Input placeholder="VD: 191943210" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
              </F>
            </div>
            {needsHubTransit(fromOffice, toOffice) && (
              <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                <b>Hành trình:</b> {fromOffice} → {HN_HUB_NAME} → {toOffice}
                <span className="ml-2 text-muted-foreground">(2 chặng · trung chuyển qua Hà Nội)</span>
              </div>
            )}
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
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="w-10 p-2"></th>
                    <th className="p-2 text-left font-medium">SL *</th>
                    <th className="p-2 text-left font-medium">Tên hàng *</th>
                    <th className="p-2 text-left font-medium">Định lượng</th>
                    <th className="p-2 text-left font-medium">Dài (cm)</th>
                    <th className="p-2 text-left font-medium">Rộng (cm)</th>
                    <th className="p-2 text-left font-medium">Cao (cm)</th>
                    <th className="p-2 text-left font-medium">Giá trị hàng</th>

                    <th className="p-2 text-left font-medium">Ghi chú</th>
                    <th className="p-2 text-left font-medium">Cước hàng</th>
                    <th className="w-10 p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((p) => (p.length > 1 ? p.filter((x) => x.id !== it.id) : p))}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                      <td className="p-1.5"><Input className="h-8" type="number" value={it.sl} onChange={(e) => updateItem(it.id, { sl: Number(e.target.value) || 0 })} /></td>
                      <td className="p-1.5 min-w-[180px]">
                        <SearchableSelect
                          value={GOODS_NAMES.includes(it.name) ? it.name : "Khác"}
                          onValueChange={(v) => updateItem(it.id, { name: v === "Khác" ? "Khác" : v })}
                          className="h-8"
                          placeholder="Chọn tên hàng"
                          options={GOODS_NAMES.map((g) => ({ value: g, label: g }))}
                        />
                        {(it.name === "Khác" || !GOODS_NAMES.includes(it.name)) && (
                          <Input
                            className="h-8 mt-1"
                            placeholder="Nhập tên hàng hóa"
                            value={it.name === "Khác" ? "" : it.name}
                            onChange={(e) => updateItem(it.id, { name: e.target.value })}
                          />
                        )}
                      </td>

                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
                          <Input className="h-8" type="number" value={it.weight} onChange={(e) => updateItem(it.id, { weight: Number(e.target.value) || 0 })} />
                          <span className="text-xs text-muted-foreground">kg</span>
                        </div>
                      </td>
                      <td className="p-1.5"><Input className="h-8 w-20" type="number" placeholder="D" value={it.dai} onChange={(e) => updateItem(it.id, { dai: Number(e.target.value) || 0 })} /></td>
                      <td className="p-1.5"><Input className="h-8 w-20" type="number" placeholder="R" value={it.rong} onChange={(e) => updateItem(it.id, { rong: Number(e.target.value) || 0 })} /></td>
                      <td className="p-1.5"><Input className="h-8 w-20" type="number" placeholder="C" value={it.cao} onChange={(e) => updateItem(it.id, { cao: Number(e.target.value) || 0 })} /></td>
                      <td className="p-1.5"><Input className="h-8" type="number" value={it.value} onChange={(e) => updateItem(it.id, { value: Number(e.target.value) || 0 })} /></td>

                      <td className="p-1.5"><Input className="h-8" placeholder="Ghi chú" value={it.note} onChange={(e) => updateItem(it.id, { note: e.target.value })} /></td>
                      <td className="p-1.5"><Input className="h-8" type="number" value={it.fare} readOnly tabIndex={-1} /></td>
                      <td className="p-1.5 text-center">
                        {idx === items.length - 1 && (
                          <button
                            type="button"
                            onClick={() => setItems((p) => [...p, newItem()])}
                            className="rounded bg-primary p-1 text-primary-foreground hover:bg-primary/90"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                Tổng: {items.length} mặt hàng · Cước mặc định {DEFAULT_FARE.toLocaleString("vi-VN")} VND
              </div>
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
                      <Input type="number" value={prepaid} onChange={(e) => setPrepaid(Number(e.target.value) || 0)} />
                    </F>
                  )}
                  <F label="Thu Hộ (COD)">
                    <Input type="number" value={codAmount} onChange={(e) => setCodAmount(Number(e.target.value) || 0)} />
                  </F>
                  <F label="Phí thu hộ COD">
                    <Input
                      type="number"
                      value={surchargeExtra}
                      disabled={!codAmount}
                      onChange={(e) => setSurchargeExtra(Number(e.target.value) || 0)}
                      placeholder={!codAmount ? "Nhập Thu hộ COD trước" : ""}
                    />
                  </F>
                  <F label="Giảm giá (hệ thống)">
                    <Input value={`${discountVND.toLocaleString("vi-VN")} VND`} readOnly disabled />
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
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button size="sm" className="gap-1.5 bg-primary" onClick={() => submit("save")}>
              <Save className="h-3.5 w-3.5" /> Lưu thay đổi
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => submit("draft")}>
              <FileText className="h-3.5 w-3.5" /> Lưu nháp
            </Button>
            <Button size="sm" variant="destructive" className="gap-1.5" onClick={clear}>
              <Trash2 className="h-3.5 w-3.5" /> Xóa
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => submit("save")}>
              <Save className="h-3.5 w-3.5" /> Tạo đơn
            </Button>
            <Button size="sm" className="gap-1.5 bg-primary" onClick={() => submit("print")}>
              <Printer className="h-3.5 w-3.5" /> Tạo đơn và In
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
      <span>{value.toLocaleString("vi-VN")}</span>
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
