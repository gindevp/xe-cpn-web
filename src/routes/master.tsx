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
import { isApiEnabled } from "@/lib/api/client";
import { geoGeocodeAddress } from "@/lib/api/geo-api";
import type { OfficeRec as StoreOfficeRec } from "@/lib/mock-data";
import { itineraryPointLabel, OFFICE_ITINERARY_POINTS } from "@/lib/mock-data";
import { OfficeLocationMap } from "@/components/OfficeLocationMap";
import { AddressPicker } from "@/components/AddressPicker";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/master")({
  head: () => ({ meta: [{ title: "Master dữ liệu — X.E" }] }),
  component: () => (
    <ProtectedPage title="Master VP / Tuyến / Xe / Tài xế" screen="master">
      <Page />
    </ProtectedPage>
  ),
});

type OfficeRec = StoreOfficeRec;

const OFFICE_SOURCE_ORDER = [
  16655, 63418, 17323, 18094, 41156, 40911, 46159, 46063, 59165, 36202, 36201, 45654, 57439, 48341, 46042, 16632,
];

function Page() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "master");
  const offices = useStore((s) => s.offices);
  const listedOffices = [...offices].sort((a, b) => {
    const ia = a.sourceId != null ? OFFICE_SOURCE_ORDER.indexOf(a.sourceId) : -1;
    const ib = b.sourceId != null ? OFFICE_SOURCE_ORDER.indexOf(b.sourceId) : -1;
    if (ia === -1 && ib === -1) return (a.code + (a.address ?? "")).localeCompare(b.code + (b.address ?? ""));
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
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
          <TabsTrigger value="vp">VP ({listedOffices.length})</TabsTrigger>
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
          <Table headers={["ID", "Địa chỉ", "Điểm lộ trình", "Tọa độ", "Mã VP", "Tên VP", ""]}>
            {listedOffices.map((o) => (
              <tr key={o.id ?? o.sourceId ?? `${o.code}-${o.address ?? ""}`} className="border-b last:border-0">
                <td className="py-2 pr-4 tabular-nums text-muted-foreground">{o.sourceId ?? "—"}</td>
                <td className="py-2 pr-4">{o.address ?? "—"}</td>
                <td className="py-2 pr-4 font-medium">{itineraryPointLabel(o.itineraryPoint)}</td>
                <td className="py-2 pr-4 text-xs tabular-nums text-muted-foreground">
                  {o.latitude != null && o.longitude != null
                    ? `${Number(o.latitude).toFixed(5)}, ${Number(o.longitude).toFixed(5)}`
                    : "Chưa có"}
                </td>
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
                          removeOffice(o);
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
          onSave={(code, name, extras) => {
            addOffice(code, name, extras);
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
          onSave={(code, name, extras) => {
            updateOffice(editVp, { code, name, ...extras });
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
  onSave: (
    code: string,
    name: string,
    extras: {
      address?: string;
      sourceId?: number;
      latitude?: number | null;
      longitude?: number | null;
      itineraryPoint?: string;
    },
  ) => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [itineraryPoint, setItineraryPoint] = useState(initial?.itineraryPoint ?? "");
  const [latText, setLatText] = useState(initial?.latitude != null ? String(initial.latitude) : "");
  const [lngText, setLngText] = useState(initial?.longitude != null ? String(initial.longitude) : "");
  const [sourceIdText, setSourceIdText] = useState(initial?.sourceId != null ? String(initial.sourceId) : "");
  const [pinning, setPinning] = useState(false);

  /** Chọn địa chỉ (V1/V2 như tạo đơn) → geocode OSM → pin map. */
  const onAddressPicked = async (full: string) => {
    setAddress(full);
    if (!full.trim() || !isApiEnabled()) return;
    setPinning(true);
    try {
      const hit = await geoGeocodeAddress(full);
      if (hit) {
        setLatText(String(hit.lat));
        setLngText(String(hit.lng));
        toast.success("Đã ping bản đồ theo huyện/tỉnh");
      } else {
        toast.message("Chưa nhận ra tỉnh — kéo pin để chỉnh");
      }
    } catch {
      toast.message("Chưa geocode được — kéo pin trên bản đồ để chọn vị trí");
    } finally {
      setPinning(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label>ID</Label>
            <Input
              inputMode="numeric"
              value={sourceIdText}
              disabled={codeReadOnly}
              readOnly={codeReadOnly}
              onChange={(e) => {
                if (codeReadOnly) return;
                setSourceIdText(e.target.value.replace(/[^\d]/g, ""));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Điểm lộ trình</Label>
            <Select value={itineraryPoint || undefined} onValueChange={setItineraryPoint}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn 1 điểm" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Tỉnh khác</SelectLabel>
                  {OFFICE_ITINERARY_POINTS.province.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Hà Nội</SelectLabel>
                  {OFFICE_ITINERARY_POINTS.hanoi.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Mỗi VP chỉ một điểm. Vế trước là tỉnh khác, vế sau là Hà Nội.</p>
          </div>
          <AddressPicker
            label="Địa chỉ văn phòng"
            required
            value={address}
            onChange={(full) => void onAddressPicked(full)}
            placeholder="Chọn địa chỉ (trước/sau sáp nhập)"
          />
          {pinning ? <p className="text-xs text-muted-foreground">Đang lấy GPS trên bản đồ…</p> : null}
          <div className="space-y-1.5">
            <Label>Bản đồ (kéo/click pin để chỉnh GPS)</Label>
            <OfficeLocationMap
              className="h-[22rem] w-full overflow-hidden rounded-md border z-0"
              lat={latText.trim() === "" || Number.isNaN(Number(latText)) ? null : Number(latText)}
              lng={lngText.trim() === "" || Number.isNaN(Number(lngText)) ? null : Number(lngText)}
              onPick={(lat, lng) => {
                setLatText(String(lat));
                setLngText(String(lng));
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Latitude</Label>
              <Input
                inputMode="decimal"
                value={latText}
                placeholder="21.02889"
                onChange={(e) => setLatText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Longitude</Label>
              <Input
                inputMode="decimal"
                value={lngText}
                placeholder="105.85250"
                onChange={(e) => setLngText(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Mã VP</Label>
              <Input
                value={code}
                disabled={codeReadOnly}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tên VP</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={() => {
              if (!code || !name) {
                toast.error("Điền đủ mã và tên VP");
                return;
              }
              if (!address.trim()) {
                toast.error("Chọn địa chỉ văn phòng");
                return;
              }
              if (!itineraryPoint) {
                toast.error("Chọn điểm lộ trình");
                return;
              }
              const lat = latText.trim() === "" ? null : Number(latText);
              const lng = lngText.trim() === "" ? null : Number(lngText);
              if (latText.trim() && (lat == null || Number.isNaN(lat))) {
                toast.error("Latitude không hợp lệ");
                return;
              }
              if (lngText.trim() && (lng == null || Number.isNaN(lng))) {
                toast.error("Longitude không hợp lệ");
                return;
              }
              const extras: {
                address?: string;
                sourceId?: number;
                latitude?: number | null;
                longitude?: number | null;
                itineraryPoint?: string;
              } = {
                address: address.trim(),
                latitude: lat,
                longitude: lng,
                itineraryPoint,
              };
              if (sourceIdText) extras.sourceId = Number(sourceIdText);
              onSave(code, name, extras);
            }}
          >
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
