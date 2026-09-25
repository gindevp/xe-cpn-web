import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isApiEnabled } from "@/lib/api/client";
import {
  emptyMaintenancePolicy,
  fetchMaintenancePolicy,
  fetchMobileAppVersion,
  fetchSessionPolicy,
  putMaintenancePolicy,
  putMobileAppVersion,
  putSessionPolicy,
  type MaintenancePolicy,
  type MobileAppVersionPolicy,
  type SessionPolicy,
} from "@/lib/api/finance-config-api";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { toast } from "sonner";

export const Route = createFileRoute("/bao-tri")({
  head: () => ({ meta: [{ title: "Cấu hình — X.E" }] }),
  component: () => (
    <ProtectedPage title="Cấu hình" screen="bao-tri">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  return (
    <Tabs defaultValue="bao-tri">
      <TabsList>
        <TabsTrigger value="bao-tri">Bảo trì</TabsTrigger>
        <TabsTrigger value="phien">Phiên đăng nhập</TabsTrigger>
        <TabsTrigger value="update">Update</TabsTrigger>
      </TabsList>
      <TabsContent value="bao-tri" className="mt-4">
        <MaintenanceTab />
      </TabsContent>
      <TabsContent value="phien" className="mt-4">
        <SessionTab />
      </TabsContent>
      <TabsContent value="update" className="mt-4">
        <MobileAppVersionTab />
      </TabsContent>
    </Tabs>
  );
}

function MaintenanceTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<MaintenancePolicy>(emptyMaintenancePolicy());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        const p = await fetchMaintenancePolicy();
        if (!cancelled) setF(p);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được cấu hình bảo trì");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setChannel = (key: keyof MaintenancePolicy, v: boolean) => {
    setF((prev) => {
      const next = { ...prev, [key]: v };
      if (key !== "blockAll" && key !== "enabled") {
        next.blockAll = false;
      }
      if (key === "blockAll" && v) {
        next.blockAppStaff = true;
        next.blockAppCustomer = true;
        next.blockWebStaff = true;
        next.blockWebCustomer = true;
      }
      return next;
    });
  };

  const save = async () => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    setSaving(true);
    try {
      if (!isApiEnabled()) throw new Error("API chưa cấu hình — không lưu được lên máy chủ");
      const saved = await putMaintenancePolicy({
        ...f,
        title: f.title.trim() || "Hệ thống đang bảo trì",
        message: f.message.trim() || "Vui lòng quay lại sau. Xin cảm ơn.",
      });
      setF(saved);
      toast.success("Đã lưu cấu hình bảo trì");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu cấu hình bảo trì thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Cấu hình bảo trì">
      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} />
            <Label className="text-sm">Bật bảo trì</Label>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-medium text-muted-foreground">Phạm vi kênh</p>
            <ChannelRow
              label="Tất cả (app + web, NV + KH)"
              checked={f.blockAll}
              onChange={(v) => setChannel("blockAll", v)}
            />
            <ChannelRow
              label="App nhân viên"
              checked={f.blockAll || f.blockAppStaff}
              disabled={f.blockAll}
              onChange={(v) => setChannel("blockAppStaff", v)}
            />
            <ChannelRow
              label="App khách hàng"
              checked={f.blockAll || f.blockAppCustomer}
              disabled={f.blockAll}
              onChange={(v) => setChannel("blockAppCustomer", v)}
            />
            <ChannelRow
              label="Web nhân viên"
              checked={f.blockAll || f.blockWebStaff}
              disabled={f.blockAll}
              onChange={(v) => setChannel("blockWebStaff", v)}
            />
            <ChannelRow
              label="Web khách hàng"
              checked={f.blockAll || f.blockWebCustomer}
              disabled={f.blockAll}
              onChange={(v) => setChannel("blockWebCustomer", v)}
            />
            <p className="text-[11px] text-muted-foreground">
              Khi bật web nhân viên: tài khoản admin vẫn vào được để tắt bảo trì; user khác bị chặn.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Tiêu đề</Label>
              <Input
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                maxLength={200}
                placeholder="Hệ thống đang bảo trì"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nội dung</Label>
              <Textarea
                value={f.message}
                onChange={(e) => setF({ ...f, message: e.target.value })}
                maxLength={2000}
                rows={4}
                placeholder="Vui lòng quay lại sau…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Ảnh bảo trì (tuỳ chọn, 1 ảnh)</Label>
            <PodPhotoInput
              photos={f.imageUrl ? [f.imageUrl] : []}
              onChange={(next) => setF({ ...f, imageUrl: next[0] ?? null })}
              max={1}
              allowGallery
              label="Chọn ảnh"
            />
          </div>

          <Button onClick={() => void save()} disabled={saving || !writable || loading}>
            {saving ? "Đang lưu…" : "Lưu cấu hình"}
          </Button>
        </div>
      )}
    </Section>
  );
}

function SessionTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<SessionPolicy>({ enabled: true, logoutTime: "21:00" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        const p = await fetchSessionPolicy();
        if (!cancelled) setF(p);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được giờ đăng xuất");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    if (!/^\d{2}:\d{2}$/.test(f.logoutTime.trim())) {
      return toast.error("Giờ đăng xuất phải dạng HH:mm, ví dụ 21:00");
    }
    setSaving(true);
    try {
      if (!isApiEnabled()) throw new Error("API chưa cấu hình — không lưu được lên máy chủ");
      const saved = await putSessionPolicy({ ...f, logoutTime: f.logoutTime.trim() });
      setF(saved);
      toast.success("Đã lưu giờ tự đăng xuất");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu giờ tự đăng xuất thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Tự đăng xuất theo giờ">
      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} />
            <Label className="text-sm">Bật tự đăng xuất</Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Giờ đăng xuất (giờ Việt Nam)</Label>
            <Input
              type="time"
              className="max-w-[10rem]"
              value={f.logoutTime}
              onChange={(e) => setF({ ...f, logoutTime: e.target.value })}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Đến giờ này mọi tài khoản đang đăng nhập sẽ bị đăng xuất. Đăng nhập sau giờ đó vẫn được,
            phiên mới kéo đến cùng giờ ngày hôm sau.
          </p>
          <Button onClick={() => void save()} disabled={saving || !writable || loading}>
            {saving ? "Đang lưu…" : "Lưu cấu hình"}
          </Button>
        </div>
      )}
    </Section>
  );
}

/** Bắt buộc cập nhật app mobile — app hỏi GET /api/mobile/app-version mỗi lần mở/quay lại. */
function MobileAppVersionTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<MobileAppVersionPolicy>({
    minimumVersion: "1.0.0",
    minimumAndroidVersionCode: null,
    mandatoryUpdateEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        const p = await fetchMobileAppVersion();
        if (!cancelled) setF(p);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được chính sách phiên bản app");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    if (!/^\d+(\.\d+){0,3}$/.test(f.minimumVersion.trim())) {
      return toast.error("Phiên bản tối thiểu phải dạng số chấm số, ví dụ 1.40.0");
    }
    setSaving(true);
    try {
      if (!isApiEnabled()) throw new Error("API chưa cấu hình — không lưu được lên máy chủ");
      const saved = await putMobileAppVersion({ ...f, minimumVersion: f.minimumVersion.trim() });
      setF({
        minimumVersion: saved.minimumVersion,
        minimumAndroidVersionCode: saved.minimumAndroidVersionCode ?? null,
        mandatoryUpdateEnabled: saved.mandatoryUpdateEnabled !== false,
      });
      toast.success("Đã lưu chính sách phiên bản app");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu chính sách phiên bản app thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Bắt buộc cập nhật app mobile">
      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải chính sách từ máy chủ…</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phiên bản tối thiểu (vd 1.40.0)">
              <Input
                value={f.minimumVersion}
                onChange={(e) => setF({ ...f, minimumVersion: e.target.value })}
                placeholder="1.40.0"
              />
            </Field>
            <Field label="Android versionCode tối thiểu (bỏ trống = không xét)">
              <Input
                inputMode="numeric"
                value={f.minimumAndroidVersionCode ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  setF({ ...f, minimumAndroidVersionCode: raw === "" ? null : Number(raw) });
                }}
                placeholder="40"
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={f.mandatoryUpdateEnabled}
              onCheckedChange={(v) => setF({ ...f, mandatoryUpdateEnabled: v })}
            />
            <Label className="text-xs">Bật chặn app cũ (tắt = không chặn ai, dùng khi cần gỡ gấp)</Label>
          </div>
          <Button onClick={() => void save()} disabled={saving || !writable}>
            {saving ? "Đang lưu…" : "Lưu chính sách app"}
          </Button>
          <p className="text-xs text-muted-foreground">
            App mobile đang cài bản thấp hơn sẽ bị chặn ở màn hình cập nhật ngay lần mở tiếp theo. Máy chủ lỗi hoặc quá 10 giây thì app vẫn vào bình thường.
          </p>
        </div>
      )}
    </Section>
  );
}

function ChannelRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <Label className="text-xs">{label}</Label>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
