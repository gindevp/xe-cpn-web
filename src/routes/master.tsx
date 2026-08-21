import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VehicleFormDialog } from "@/components/VehicleFormDialog";
import { useStore, type VehicleRec } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/master")({
  head: () => ({ meta: [{ title: "Master dữ liệu — X.E" }] }),
  component: () => (
    <ProtectedPage title="Master VP / Tuyến / Xe / Tài xế" screen="master">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "master");
  const offices = useStore((s) => s.offices);
  const routes = useStore((s) => s.routes);
  const vehicles = useStore((s) => s.vehicles);
  const drivers = useStore((s) => s.drivers);
  const { addOffice, removeOffice, addRoute, removeRoute, removeVehicle, addDriver, removeDriver } = useStore.getState();

  const [dlg, setDlg] = useState<null | "vp" | "tuyen" | "xe" | "xe-edit" | "ts">(null);
  const [editXe, setEditXe] = useState<VehicleRec | null>(null);

  return (
    <Section title="Danh mục">
      <Tabs defaultValue="vp">
        <TabsList>
          <TabsTrigger value="vp">VP ({offices.length})</TabsTrigger>
          <TabsTrigger value="tuyen">Tuyến ({routes.length})</TabsTrigger>
          <TabsTrigger value="xe">Xe ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="ts">Tài xế ({drivers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="vp" className="mt-4">
          {writable && <Button className="mb-3" onClick={() => setDlg("vp")}>Thêm VP</Button>}
          <Table headers={["Mã VP", "Tên VP", ""]}>
            {offices.map((o) => (
              <tr key={o.code} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{o.code}</td>
                <td className="py-2 pr-4">{o.name}</td>
                <td className="py-2 pr-4">{writable && <Del onClick={() => { removeOffice(o.code); toast.success("Đã xóa"); }} />}</td>
              </tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="tuyen" className="mt-4">
          {writable && <Button className="mb-3" onClick={() => setDlg("tuyen")}>Thêm tuyến</Button>}
          <Table headers={["Tuyến", ""]}>
            {routes.map((r) => (
              <tr key={r} className="border-b last:border-0">
                <td className="py-2 pr-4">{r}</td>
                <td className="py-2 pr-4">{writable && <Del onClick={() => { removeRoute(r); toast.success("Đã xóa"); }} />}</td>
              </tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="xe" className="mt-4">
          {writable && <Button className="mb-3" onClick={() => setDlg("xe")}>Thêm xe</Button>}
          <Table headers={["BKS", "Loại xe", "Định mức (kg)", "Thể tích", "VP", "Tài xế", ""]}>
            {vehicles.map((v) => (
              <tr key={v.bks} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{v.bks}</td>
                <td className="py-2 pr-4">{v.vehicleType ?? "—"}</td>
                <td className="py-2 pr-4">{v.capacity}</td>
                <td className="py-2 pr-4">{v.volumeM3 != null ? `${v.volumeM3} m³` : "—"}</td>
                <td className="py-2 pr-4">{offices.find((o) => o.code === v.officeCode)?.name ?? v.officeCode ?? "—"}</td>
                <td className="py-2 pr-4">{v.driverName ?? "—"}</td>
                <td className="py-2 pr-4">
                  {writable && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => { setEditXe(v); setDlg("xe-edit"); }}>Sửa</Button>
                      <Del onClick={() => { removeVehicle(v.bks); toast.success("Đã xóa"); }} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="ts" className="mt-4">
          {writable && <Button className="mb-3" onClick={() => setDlg("ts")}>Thêm tài xế</Button>}
          <Table headers={["Tài xế", ""]}>
            {drivers.map((d) => (
              <tr key={d} className="border-b last:border-0">
                <td className="py-2 pr-4">{d}</td>
                <td className="py-2 pr-4">{writable && <Del onClick={() => { removeDriver(d); toast.success("Đã xóa"); }} />}</td>
              </tr>
            ))}
          </Table>
        </TabsContent>
      </Tabs>

      {dlg === "vp" && <VpDialog onClose={() => setDlg(null)} onSave={(code, name) => { addOffice(code, name); toast.success("Đã thêm VP"); setDlg(null); }} />}
      {dlg === "tuyen" && <SingleDialog title="Thêm tuyến" label="Tuyến (ví dụ HN → HCM)" onClose={() => setDlg(null)} onSave={(v) => { addRoute(v); toast.success("Đã thêm tuyến"); setDlg(null); }} />}
      {dlg === "xe" && <VehicleFormDialog mode="create" onClose={() => setDlg(null)} />}
      {dlg === "xe-edit" && editXe && (
        <VehicleFormDialog
          mode="edit"
          initial={editXe}
          onClose={() => { setDlg(null); setEditXe(null); }}
        />
      )}
      {dlg === "ts" && <SingleDialog title="Thêm tài xế" label="Họ tên" onClose={() => setDlg(null)} onSave={(v) => { addDriver(v); toast.success("Đã thêm tài xế"); setDlg(null); }} />}
    </Section>
  );
}

function Del({ onClick }: { onClick: () => void }) {
  return <Button size="sm" variant="ghost" className="text-destructive" onClick={onClick}><Trash2 className="h-4 w-4" /></Button>;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr className="border-b">{headers.map((h, i) => (<th key={i} className="py-2 pr-4">{h}</th>))}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function VpDialog({ onClose, onSave }: { onClose: () => void; onSave: (code: string, name: string) => void }) {
  const [code, setCode] = useState(""); const [name, setName] = useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Thêm VP</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>Mã</Label><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label>Tên</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => code && name ? onSave(code, name) : toast.error("Điền đủ")}>Thêm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SingleDialog({ title, label, onClose, onSave }: { title: string; label: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-1.5"><Label>{label}</Label><Input value={v} onChange={(e) => setV(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => v ? onSave(v) : toast.error("Nhập giá trị")}>Thêm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
