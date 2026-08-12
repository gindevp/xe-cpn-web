import { createFileRoute, Link } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/mock-data";
import { useStore, type TripX } from "@/lib/store";
import { TripStatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { genTripCode } from "@/lib/pricing";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/chuyen")({
  head: () => ({ meta: [{ title: "Chuyến — X.E" }] }),
  component: () => (
    <ProtectedPage title="Chuyến vận chuyển" screen="chuyen">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const { session } = useAuth();
  const trips = useStore((s) => s.trips);
  const routes = useStore((s) => s.routes);
  const offices = useStore((s) => s.offices);
  const [filters, setFilters] = useState({ date: "", route: "all", office: "all" });
  const [openCreate, setOpenCreate] = useState(false);
  const writable = canWrite(session?.role, "chuyen");

  const rows = useMemo(() => trips.filter((t) => {
    if (filters.route !== "all" && t.route !== filters.route) return false;
    if (filters.office !== "all" && t.office !== filters.office) return false;
    if (filters.date && !t.departAt.startsWith(filters.date)) return false;
    return true;
  }), [trips, filters]);

  return (
    <div className="space-y-4">
      <Section title="Bộ lọc" right={
        writable
          ? <Button className="gap-2" onClick={() => setOpenCreate(true)}><Plus className="h-4 w-4" /> Tạo chuyến</Button>
          : <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Chế độ chỉ xem</span>
      }>
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="Ngày"><Input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></F>
          <F label="Tuyến">
            <Select value={filters.route} onValueChange={(v) => setFilters({ ...filters, route: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tất cả</SelectItem>{routes.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent>
            </Select>
          </F>
          <F label="VP">
            <Select value={filters.office} onValueChange={(v) => setFilters({ ...filters, office: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tất cả</SelectItem>{offices.map((o) => (<SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>))}</SelectContent>
            </Select>
          </F>
        </div>
      </Section>

      <Section title={`Danh sách chuyến (${rows.length})`}>
        {rows.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Mã chuyến</th>
                  <th className="py-2 pr-4">BKS</th>
                  <th className="py-2 pr-4">Tài xế</th>
                  <th className="py-2 pr-4">Tuyến</th>
                  <th className="py-2 pr-4">Giờ</th>
                  <th className="py-2 pr-4">Đã quét</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2 pr-4">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => <TripRow key={t.code} t={t} />)}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {openCreate && (
        <CreateTrip
          onClose={() => setOpenCreate(false)}
          office={session?.office !== "ALL" ? (session?.office ?? "GP") : "GP"}
        />
      )}
    </div>
  );
}

function TripRow({ t }: { t: TripX }) {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const transitionTrip = useStore((s) => s.transitionTrip);
  const writable = canWrite(session?.role, "chuyen");
  const isDH = session?.role === "DH" || session?.role === "AD";
  const doDepart = () => {
    const r = transitionTrip(t.code, "DEPARTED");
    if (!r.ok) toast.error(r.error); else toast.success("Đã xuất bến");
  };
  const doArrive = () => {
    const r = transitionTrip(t.code, "UNLOADING");
    if (!r.ok) toast.error(r.error); else toast.success("Bắt đầu nhập");
  };
  const doClose = () => {
    // GAP-5: chặn đóng nếu lệch, chỉ ĐH/AD force
    const loadedCodes = t.loadedCodes && t.loadedCodes.length ? t.loadedCodes : (t.scannedCodes ?? []);
    const arrived = loadedCodes.filter((c) => {
      const o = orders.find((x) => x.code === c);
      return o && ["AT_DEST", "OUT_FOR_DELIVERY", "DELIVERED"].includes(o.status);
    }).length;
    const diff = loadedCodes.length - arrived;
    if (diff > 0) {
      if (!isDH) {
        toast.error(`Chuyến lệch ${diff} đơn — đối soát trước (E-TRIP-CLOSE)`);
        return;
      }
      if (!confirm(`Chuyến lệch ${diff} đơn. ĐH xác nhận force đóng?`)) return;
      useStore.getState().audit({ action: "TRIP_FORCE_CLOSE", entityType: "trip", entityId: t.code, detail: `lệch ${diff} đơn` });
    }
    const r = transitionTrip(t.code, "CLOSED");
    if (!r.ok) toast.error(r.error); else toast.success("Đã đóng chuyến");
  };
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2 pr-4 font-medium">{t.code}</td>
      <td className="py-2 pr-4">{t.bks}</td>
      <td className="py-2 pr-4">{t.driver}</td>
      <td className="py-2 pr-4">{t.route}</td>
      <td className="py-2 pr-4 text-muted-foreground">{formatDateTime(t.departAt)}</td>
      <td className="py-2 pr-4">{(t.scannedCodes ?? []).length}</td>
      <td className="py-2 pr-4"><TripStatusBadge status={t.status} /></td>
      <td className="py-2 pr-4">
        <div className="flex flex-wrap gap-1">
          {writable && ["CREATED", "LOADING"].includes(t.status) && (
            <Button size="sm" variant="ghost" asChild><Link to="/quet-xuat">Mở quét</Link></Button>
          )}
          {writable && t.status === "LOADING" && <Button size="sm" variant="outline" onClick={doDepart}>Xuất bến</Button>}
          {writable && t.status === "DEPARTED" && <Button size="sm" variant="outline" onClick={doArrive}>Bắt đầu nhập</Button>}
          {writable && t.status === "UNLOADING" && <Button size="sm" variant="outline" onClick={doClose}>Đóng</Button>}
          <Button size="sm" variant="ghost" asChild><Link to="/doi-soat">Đối soát</Link></Button>
        </div>
      </td>
    </tr>
  );
}

function CreateTrip({ onClose, office }: { onClose: () => void; office: string }) {
  const vehicles = useStore((s) => s.vehicles);
  const drivers = useStore((s) => s.drivers);
  const routes = useStore((s) => s.routes);
  const addTrip = useStore((s) => s.addTrip);
  const [bks, setBks] = useState(vehicles[0]?.bks ?? "");
  const [driver, setDriver] = useState(drivers[0] ?? "");
  const [route, setRoute] = useState(routes[0] ?? "");
  const [dep, setDep] = useState(new Date().toISOString().slice(0, 16));
  const code = useMemo(() => genTripCode(office), [office]);

  const submit = async () => {
    if (!bks || !driver || !route || !dep) return toast.error("Điền đủ thông tin");
    const departAt = new Date(dep).toISOString();
    const { isApiEnabled } = await import("@/lib/api/client");
    if (isApiEnabled()) {
      try {
        const { createTrip } = await import("@/lib/api/domain-api");
        const created = await createTrip({
          officeCode: office,
          routeCode: route,
          vehiclePlate: bks,
          driverName: driver,
          departAt,
        });
        addTrip(created);
        useStore.getState().audit({ action: "TRIP_CREATE", entityType: "trip", entityId: created.code, detail: "API" });
        toast.success("Đã tạo chuyến " + created.code);
        onClose();
        return;
      } catch (err: any) {
        toast.error(err?.message || "Không tạo được chuyến trên máy chủ");
        return;
      }
    }
    const t: TripX = {
      code, bks, driver, route, departAt,
      status: "CREATED", office, scanned: 0, loaded: 0,
      scannedCodes: [], loadedCodes: [], events: [],
    };
    addTrip(t);
    useStore.getState().audit({ action: "TRIP_CREATE", entityType: "trip", entityId: code });
    toast.success("Đã tạo chuyến " + code);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tạo chuyến mới</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="BKS *">
            <Select value={bks} onValueChange={setBks}>
              <SelectTrigger><SelectValue placeholder="Chọn xe" /></SelectTrigger>
              <SelectContent>{vehicles.map((v) => (<SelectItem key={v.bks} value={v.bks}>{v.bks}</SelectItem>))}</SelectContent>
            </Select>
          </F>
          <F label="Tài xế *">
            <Select value={driver} onValueChange={setDriver}>
              <SelectTrigger><SelectValue placeholder="Chọn tài xế" /></SelectTrigger>
              <SelectContent>{drivers.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}</SelectContent>
            </Select>
          </F>
          <F label="Tuyến *">
            <Select value={route} onValueChange={setRoute}>
              <SelectTrigger><SelectValue placeholder="Chọn tuyến" /></SelectTrigger>
              <SelectContent>{routes.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent>
            </Select>
          </F>
          <F label="Giờ khởi hành *"><Input type="datetime-local" value={dep} onChange={(e) => setDep(e.target.value)} /></F>
          <F label="Mã chuyến (auto)"><Input disabled value={code} /></F>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={submit}>Tạo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
