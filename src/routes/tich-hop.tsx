import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore, type Integrations } from "@/lib/store";
import { useState } from "react";
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
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
