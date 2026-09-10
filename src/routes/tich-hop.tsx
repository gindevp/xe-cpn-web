import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isApiEnabled } from "@/lib/api/client";
import { fetchMobileAppVersion, putMobileAppVersion, type MobileAppVersionPolicy } from "@/lib/api/finance-config-api";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { useStore, type Integrations } from "@/lib/store";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/tich-hop")({
  head: () => ({ meta: [{ title: "Tích hợp — X.E" }] }),
  component: () => (
    <ProtectedPage title="Cấu hình tích hợp" screen="tich-hop">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const integrations = useStore((s) => s.integrations);
  const setIntegrations = useStore((s) => s.setIntegrations);
  const [f, setF] = useState<Integrations>({
    ahamoveToken: "",
    grabToken: "",
    xanhsmToken: "",
    goongToken: "",
    telegramToken: "",
    telegramChatId: integrations.telegramChatId ?? "",
    webhookUrl: integrations.webhookUrl ?? "",
    webhookSecret: "",
  });
  const [testing, setTesting] = useState(false);

  const mask = (v?: string) => (v ? "•".repeat(Math.min(v.length, 8)) : "");

  const save = () => {
    const patch: Integrations = {};
    (Object.keys(f) as (keyof Integrations)[]).forEach((k) => {
      const val = (f as any)[k];
      if (val) (patch as any)[k] = val;
    });
    setIntegrations(patch);
    setF({
      ...f,
      ahamoveToken: "", grabToken: "", xanhsmToken: "", goongToken: "",
      telegramToken: "", webhookSecret: "",
    });
    toast.success("Đã lưu · secret được mask");
  };

  const test = () => {
    const anyFilled = Object.values(f).some((v) => v) || Object.values(integrations).some((v) => v);
    if (!anyFilled) return toast.error("Chưa cấu hình gì");
    setTesting(true);
    void (async () => {
      try {
        const { isApiEnabled } = await import("@/lib/api/client");
        if (isApiEnabled()) {
          const { testIntegrationConfig } = await import("@/lib/api/finance-config-api");
          const r = await testIntegrationConfig();
          toast.success((r as any)?.ok === false ? "Test thất bại" : "Test kết nối OK");
        } else {
          toast.success("Test kết nối OK");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Test kết nối thất bại");
      } finally {
        setTesting(false);
      }
    })();
  };

  return (
    <div className="space-y-4">
      <Section title="Đối tác vận chuyển">
        <div className="grid gap-3 sm:grid-cols-3">
          <F label={`Token Ahamove ${integrations.ahamoveToken ? "· đã lưu" : ""}`}>
            <Input type="password" placeholder={mask(integrations.ahamoveToken) || "Nhập token"} value={f.ahamoveToken} onChange={(e) => setF({ ...f, ahamoveToken: e.target.value })} />
          </F>
          <F label={`Token Grab ${integrations.grabToken ? "· đã lưu" : ""}`}>
            <Input type="password" placeholder={mask(integrations.grabToken) || "Nhập token"} value={f.grabToken} onChange={(e) => setF({ ...f, grabToken: e.target.value })} />
          </F>
          <F label={`Token XanhSM ${integrations.xanhsmToken ? "· đã lưu" : ""}`}>
            <Input type="password" placeholder={mask(integrations.xanhsmToken) || "Nhập token"} value={f.xanhsmToken} onChange={(e) => setF({ ...f, xanhsmToken: e.target.value })} />
          </F>
        </div>
      </Section>

      <Section title="Bản đồ / Khoảng cách">
        <F label={`Goong / Google Distance Matrix ${integrations.goongToken ? "· đã lưu" : ""}`}>
          <Input type="password" placeholder={mask(integrations.goongToken) || "API key"} value={f.goongToken} onChange={(e) => setF({ ...f, goongToken: e.target.value })} />
        </F>
      </Section>

      <Section title="Telegram cảnh báo">
        <div className="grid gap-3 sm:grid-cols-2">
          <F label={`Bot token ${integrations.telegramToken ? "· đã lưu" : ""}`}>
            <Input type="password" placeholder={mask(integrations.telegramToken) || "••••••"} value={f.telegramToken} onChange={(e) => setF({ ...f, telegramToken: e.target.value })} />
          </F>
          <F label="Chat ID"><Input value={f.telegramChatId} onChange={(e) => setF({ ...f, telegramChatId: e.target.value })} placeholder="-1001234567890" /></F>
        </div>
      </Section>

      <Section title="Webhook">
        <div className="grid gap-3 sm:grid-cols-2">
          <F label={`Webhook URL ${integrations.webhookUrl ? "· đã lưu" : ""}`}>
            <Input value={f.webhookUrl} onChange={(e) => setF({ ...f, webhookUrl: e.target.value })} placeholder="https://…" />
          </F>
          <F label={`Webhook secret (HMAC) ${integrations.webhookSecret ? "· đã lưu" : ""}`}>
            <Input type="password" placeholder={mask(integrations.webhookSecret) || "shared secret"} value={f.webhookSecret} onChange={(e) => setF({ ...f, webhookSecret: e.target.value })} />
          </F>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save}>Lưu</Button>
        <Button variant="outline" onClick={test} disabled={testing}>{testing ? "Đang test…" : "Test kết nối"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cập nhật gần nhất: {integrations.updatedAt ? new Date(integrations.updatedAt).toLocaleString("vi-VN") : "—"}
      </p>

      <MobileAppVersion />
    </div>
  );
}

/** Bắt buộc cập nhật app mobile — app hỏi GET /api/mobile/app-version mỗi lần mở/quay lại. */
function MobileAppVersion() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "tich-hop");
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
            <F label="Phiên bản tối thiểu (vd 1.40.0)">
              <Input
                value={f.minimumVersion}
                onChange={(e) => setF({ ...f, minimumVersion: e.target.value })}
                placeholder="1.40.0"
              />
            </F>
            <F label="Android versionCode tối thiểu (bỏ trống = không xét)">
              <Input
                inputMode="numeric"
                value={f.minimumAndroidVersionCode ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  setF({ ...f, minimumAndroidVersionCode: raw === "" ? null : Number(raw) });
                }}
                placeholder="40"
              />
            </F>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={f.mandatoryUpdateEnabled}
              onCheckedChange={(v) => setF({ ...f, mandatoryUpdateEnabled: v })}
            />
            <Label className="text-xs">Bật chặn app cũ (tắt = không chặn ai, dùng khi cần gỡ gấp)</Label>
          </div>
          <Button onClick={save} disabled={saving || !writable}>
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

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
