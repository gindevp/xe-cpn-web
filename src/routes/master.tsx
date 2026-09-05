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

type OfficeRec = { code: string; name: string; isHub?: boolean };

function Page() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "master");
  const offices = useStore((s) => s.offices);
  const routes = useStore((s) => s.routes);
  const vehicles = useStore((s) => s.vehicles);
  const drivers = useStore((s) => s.drivers);
  const {
    addOffice,
    updateOffice,
    removeOffice,
    addRoute,
    updateRoute,
    removeRoute,
    removeVehicle,
    addDriver,
    updateDriver,
    removeDriver,
  } = useStore.getState();

  const [dlg, setDlg] = useState<null | "vp" | "vp-edit" | "tuyen" | "tuyen-edit" | "xe" | "xe-edit" | "ts" | "ts-edit">(
    null,
  );
  const [editXe, setEditXe] = useState<VehicleRec | null>(null);
  const [editVp, setEditVp] = useState<OfficeRec | null>(null);
  const [editRoute, setEditRoute] = useState<string | null>(null);
  const [editDriver, setEditDriver] = useState<string | null>(null);

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
          {writable && (
            <Button className="mb-3" onClick={() => setDlg("vp")}>
              Thêm VP
            </Button>
          )}
          <Table headers={["Mã VP", "Tên VP", ""]}>
            {offices.map((o) => (
              <tr key={o.code} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{o.code}</td>
                <td className="py-2 pr-4">{o.name}</td>
                <td className="py-2 pr-4">
                  {writable && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditVp(o);
                          setDlg("vp-edit");
                        }}
                      >
                        Sửa
                      </Button>
                      <Del
                        onClick={() => {
                          removeOffice(o.code);
                          toast.success("Đã xóa");
                        }}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="tuyen" className="mt-4">
          {writable && (
            <Button className="mb-3" onClick={() => setDlg("tuyen")}>
              Thêm tuyến
            </Button>
          )}
          <Table headers={["Tuyến", ""]}>
            {routes.map((r) => (
              <tr key={r} className="border-b last:border-0">
                <td className="py-2 pr-4">{r}</td>
                <td className="py-2 pr-4">
                  {writable && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditRoute(r);
                          setDlg("tuyen-edit");
                        }}
                      >
                        Sửa
                      </Button>
                      <Del
                        onClick={() => {
                          if (
                            !confirm(
                              `Xóa tuyến "${r}"?\nNếu tuyến đang gắn chuyến, hệ thống sẽ ẩn khỏi danh sách (không xóa lịch sử chuyến).`,
                            )
                          )
                            return;
                          removeRoute(r);
                          toast.success("Đã gửi lệnh xóa tuyến");
                        }}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="xe" className="mt-4">
          {writable && (
            <Button className="mb-3" onClick={() => setDlg("xe")}>
              Thêm xe
            </Button>
          )}
          <Table headers={["BKS", "Loại xe", "Định mức (kg)", "Thể tích", "VP", "Tài xế", ""]}>
            {vehicles.map((v) => (
              <tr key={v.bks} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{v.bks}</td>
                <td className="py-2 pr-4">{v.vehicleType ?? "—"}</td>
                <td className="py-2 pr-4">{v.capacity}</td>
                <td className="py-2 pr-4">{v.volumeM3 != null ? `${v.volumeM3} m³` : "—"}</td>
                <td className="py-2 pr-4">
                  {offices.find((o) => o.code === v.officeCode)?.name ?? v.officeCode ?? "—"}
                </td>
                <td className="py-2 pr-4">{v.driverName ?? "—"}</td>
                <td className="py-2 pr-4">
                  {writable && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditXe(v);
                          setDlg("xe-edit");
                        }}
                      >
                        Sửa
                      </Button>
                      <Del
                        onClick={() => {
                          removeVehicle(v.bks);
                          toast.success("Đã xóa");
                        }}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="ts" className="mt-4">
          {writable && (
            <Button className="mb-3" onClick={() => setDlg("ts")}>
              Thêm tài xế
            </Button>
          )}
          <Table headers={["Tài xế", ""]}>
            {drivers.map((d) => (
              <tr key={d} className="border-b last:border-0">
                <td className="py-2 pr-4">{d}</td>
                <td className="py-2 pr-4">
                  {writable && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditDriver(d);
                          setDlg("ts-edit");
                        }}
                      >
                        Sửa
                      </Button>
                      <Del
                        onClick={() => {
                          removeDriver(d);
                          toast.success("Đã xóa");
                        }}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </TabsContent>
      </Tabs>

      {dlg === "vp" && (
        <VpDialog
          title="Thêm VP"
          onClose={() => setDlg(null)}
          onSave={(code, name) => {
            addOffice(code, name);
            toast.success("Đã thêm VP");
            setDlg(null);
          }}
        />
      )}
      {dlg === "vp-edit" && editVp && (
        <VpDialog
          title="Sửa VP"
          initial={editVp}
          codeReadOnly
          saveLabel="Lưu"
          onClose={() => {
            setDlg(null);
            setEditVp(null);
          }}
          onSave={(code, name) => {
            updateOffice(editVp.code, { code, name });
            toast.success("Đã cập nhật VP");
            setDlg(null);
            setEditVp(null);
          }}
        />
      )}
      {dlg === "tuyen" && (
        <SingleDialog
          title="Thêm tuyến"
          label="Tuyến (ví dụ HN → HCM)"
          onClose={() => setDlg(null)}
          onSave={(v) => {
            addRoute(v);
            toast.success("Đã thêm tuyến");
            setDlg(null);
          }}
        />
      )}
      {dlg === "tuyen-edit" && editRoute != null && (
        <SingleDialog
          title="Sửa tuyến"
          label="Tên tuyến"
          initial={editRoute}
          saveLabel="Lưu"
          onClose={() => {
            setDlg(null);
            setEditRoute(null);
          }}
          onSave={(v) => {
            updateRoute(editRoute, v);
            toast.success("Đã cập nhật tuyến");
            setDlg(null);
            setEditRoute(null);
          }}
        />
      )}
      {dlg === "xe" && <VehicleFormDialog mode="create" onClose={() => setDlg(null)} />}
      {dlg === "xe-edit" && editXe && (
        <VehicleFormDialog
          mode="edit"
          initial={editXe}
          onClose={() => {
            setDlg(null);
            setEditXe(null);
          }}
        />
      )}
      {dlg === "ts" && (
        <SingleDialog
          title="Thêm tài xế"
          label="Họ tên"
          onClose={() => setDlg(null)}
          onSave={(v) => {
            addDriver(v);
            toast.success("Đã thêm tài xế");
            setDlg(null);
          }}
        />
      )}
      {dlg === "ts-edit" && editDriver != null && (
        <SingleDialog
          title="Sửa tài xế"
          label="Họ tên"
          initial={editDriver}
          saveLabel="Lưu"
          onClose={() => {
            setDlg(null);
            setEditDriver(null);
          }}
          onSave={(v) => {
            updateDriver(editDriver, v);
            toast.success("Đã cập nhật tài xế");
            setDlg(null);
            setEditDriver(null);
          }}
        />
      )}
    </Section>
  );
}

function Del({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="text-destructive" onClick={onClick}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr className="border-b">
            {headers.map((h, i) => (
              <th key={i} className="py-2 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function VpDialog({
  title,
  initial,
  codeReadOnly,
  saveLabel = "Thêm",
  onClose,
  onSave,
}: {
  title: string;
  initial?: OfficeRec;
  codeReadOnly?: boolean;
  saveLabel?: string;
  onClose: () => void;
  onSave: (code: string, name: string) => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Mã</Label>
            <Input
              value={code}
              disabled={codeReadOnly}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tên</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={() => (code && name ? onSave(code, name) : toast.error("Điền đủ"))}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SingleDialog({
  title,
  label,
  initial = "",
  saveLabel = "Thêm",
  onClose,
  onSave,
}: {
  title: string;
  label: string;
  initial?: string;
  saveLabel?: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Input value={v} onChange={(e) => setV(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={() => (v.trim() ? onSave(v.trim()) : toast.error("Nhập giá trị"))}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
