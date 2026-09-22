import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isApiEnabled } from "@/lib/api/client";
import {
  emptyMaintenancePolicy,
  fetchMaintenancePolicy,
  putMaintenancePolicy,
  type MaintenancePolicy,
} from "@/lib/api/finance-config-api";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { toast } from "sonner";

export const Route = createFileRoute("/bao-tri")({
  head: () => ({ meta: [{ title: "Bảo trì — X.E" }] }),
  component: () => (
    <ProtectedPage title="Bảo trì" screen="bao-tri">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
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
    <div className="space-y-4">
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
    </div>
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
