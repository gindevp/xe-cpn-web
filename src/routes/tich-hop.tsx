import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isApiEnabled } from "@/lib/api/client";
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
    ahamoveApiKey: "",
    ahamoveMobile: integrations.ahamoveMobile ?? "",
    grabToken: "",
    xanhsmToken: "",
    goongToken: "",
    goongMapTilesKey: "",
    mapProvider: integrations.mapProvider ?? "OSM",
    telegramToken: "",
    telegramChatId: integrations.telegramChatId ?? "",
    webhookUrl: integrations.webhookUrl ?? "",
    webhookSecret: "",
  });
  const [testing, setTesting] = useState(false);
  const [testingAhamove, setTestingAhamove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiKeyFocused, setApiKeyFocused] = useState(false);

  const SECRET_MASK = "••••••••••••";
  const hasSavedApiKey = Boolean(integrations.ahamoveApiKey?.trim());
  const mask = (v?: string) => (v ? "•".repeat(Math.min(v.length, 8)) : "");

  // Load cấu hình từ BE khi vào màn — tránh store trống / lệch DB.
  useEffect(() => {
    if (!isApiEnabled()) return;
    void (async () => {
      try {
        const { fetchIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const saved = await fetchIntegrationConfig();
        useStore.setState({ integrations: saved });
        setF((prev) => ({
          ...prev,
          ahamoveMobile: saved.ahamoveMobile ?? prev.ahamoveMobile ?? "",
          mapProvider: saved.mapProvider ?? prev.mapProvider ?? "OSM",
          telegramChatId: saved.telegramChatId ?? prev.telegramChatId ?? "",
          webhookUrl: saved.webhookUrl ?? prev.webhookUrl ?? "",
        }));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const save = () => {
    const typedKey = f.ahamoveApiKey?.trim() || "";
    const isNewKey = Boolean(typedKey) && typedKey !== SECRET_MASK;
    const apiKey = isNewKey ? typedKey : "";
    const mobile = (f.ahamoveMobile?.trim() || integrations.ahamoveMobile?.trim()) || "";
    if (apiKey && !mobile) {
      return toast.error("Lưu Ahamove cần thêm SĐT (API key + SĐT mới lấy được token)");
    }
    if (f.ahamoveMobile?.trim() && !apiKey && !hasSavedApiKey) {
      return toast.error("Lưu Ahamove cần thêm API Key");
    }
    const patch: Integrations = {};
    (Object.keys(f) as (keyof Integrations)[]).forEach((k) => {
      if (k === "ahamoveApiKey") return;
      if (k === "mapProvider") return;
      const val = (f as any)[k];
      if (val && val !== SECRET_MASK) (patch as any)[k] = val;
    });
    patch.mapProvider = f.mapProvider === "GOONG" ? "GOONG" : "OSM";
    if (apiKey && mobile) {
      patch.ahamoveApiKey = apiKey;
      patch.ahamoveMobile = mobile;
    } else if (f.ahamoveMobile?.trim()) {
      patch.ahamoveMobile = mobile;
    }
    setSaving(true);
    void (async () => {
      try {
        if (!isApiEnabled()) {
          setIntegrations(patch);
          toast.success("Đã lưu (local)");
          return;
        }
        const { putIntegrationConfig, fetchIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const saved = await putIntegrationConfig(patch);
        useStore.setState({ integrations: saved });
        // Đồng bộ lại từ GET — xác nhận key đã nằm DB.
        try {
          const fresh = await fetchIntegrationConfig();
          useStore.setState({ integrations: fresh });
        } catch {
          /* keep saved */
        }
        setF((prev) => ({
          ...prev,
          ahamoveApiKey: "",
          grabToken: "",
          xanhsmToken: "",
          goongToken: "",
          goongMapTilesKey: "",
          mapProvider: saved.mapProvider ?? prev.mapProvider ?? "OSM",
          telegramToken: "",
          webhookSecret: "",
          ahamoveMobile: mobile || prev.ahamoveMobile,
        }));
        setApiKeyFocused(false);
        toast.success(saved.ahamoveApiKey ? "Đã lưu API key + SĐT Ahamove" : "Đã lưu");
      } catch (e: any) {
        toast.error(e?.message ?? "Lưu thất bại");
      } finally {
        setSaving(false);
      }
    })();
  };

  const testAhamove = () => {
    const typedKey = f.ahamoveApiKey?.trim() || "";
    const isNewKey = Boolean(typedKey) && typedKey !== SECRET_MASK;
    const apiKey = isNewKey ? typedKey : undefined;
    const mobile = (f.ahamoveMobile?.trim() || integrations.ahamoveMobile?.trim()) || undefined;
    if (!apiKey && !hasSavedApiKey) {
      return toast.error("Nhập API Key Ahamove (hoặc Lưu key trước)");
    }
    if (!mobile) {
      return toast.error("Nhập SĐT Ahamove (bắt buộc cùng API key để lấy token)");
    }
    setTestingAhamove(true);
    void (async () => {
      try {
        if (!isApiEnabled()) throw new Error("API chưa cấu hình");
        const { testAhamoveApiKey, fetchIntegrationConfig } = await import("@/lib/api/finance-config-api");
        // Có key mới trên input → gửi kèm; không thì BE dùng key đã lưu.
        const body: { ahamoveApiKey?: string; ahamoveMobile: string } = { ahamoveMobile: mobile };
        if (apiKey) body.ahamoveApiKey = apiKey;
        const r = await testAhamoveApiKey(body);
        if (r.ok === false || r.ahamoveTokenOk === false) {
          toast.error(r.ahamoveError || r.message || "Lấy token Ahamove thất bại");
        } else {
          toast.success(
            apiKey
              ? r.message || "API key OK — đã lưu & lấy token"
              : (r.message || "OK") + " (dùng API key đã lưu)",
          );
          setF((prev) => ({ ...prev, ahamoveApiKey: "", ahamoveMobile: mobile }));
          setApiKeyFocused(false);
          try {
            const saved = await fetchIntegrationConfig();
            useStore.setState({ integrations: saved });
          } catch {
            /* ignore */
          }
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Test Ahamove thất bại");
      } finally {
        setTestingAhamove(false);
      }
    })();
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
          if ((r as any)?.ok === false) {
            toast.error((r as any)?.ahamoveError ?? "Test thất bại");
          } else {
            toast.success("Test kết nối OK");
          }
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <F label={`API Key Ahamove ${hasSavedApiKey ? "· đã lưu" : ""}`}>
            <Input
              type="password"
              autoComplete="off"
              placeholder={hasSavedApiKey ? "Nhập key mới để thay" : "API key Partner"}
              value={
                f.ahamoveApiKey
                  ? f.ahamoveApiKey
                  : !apiKeyFocused && hasSavedApiKey
                    ? SECRET_MASK
                    : ""
              }
              onFocus={() => {
                setApiKeyFocused(true);
                if (!f.ahamoveApiKey && hasSavedApiKey) {
                  setF((prev) => ({ ...prev, ahamoveApiKey: "" }));
                }
              }}
              onBlur={() => {
                if (!f.ahamoveApiKey?.trim()) setApiKeyFocused(false);
              }}
              onChange={(e) => setF({ ...f, ahamoveApiKey: e.target.value })}
            />
          </F>
          <F label={`SĐT Ahamove ${integrations.ahamoveMobile ? "· đã lưu" : ""}`}>
            <Input
              placeholder={integrations.ahamoveMobile || "84xxxxxxxxx (vd 84901234567)"}
              value={f.ahamoveMobile ?? ""}
              onChange={(e) => setF({ ...f, ahamoveMobile: e.target.value })}
            />
          </F>
          <div className="flex items-end">
            <Button type="button" variant="secondary" className="w-full" onClick={testAhamove} disabled={testingAhamove}>
              {testingAhamove ? "Đang lấy token…" : hasSavedApiKey && !(f.ahamoveApiKey?.trim()) ? "Test (key đã lưu)" : "Test API key Ahamove"}
            </Button>
          </div>
          <F label={`Token Grab ${integrations.grabToken ? "· đã lưu" : ""}`}>
            <Input type="password" placeholder={mask(integrations.grabToken) || "Nhập token"} value={f.grabToken} onChange={(e) => setF({ ...f, grabToken: e.target.value })} />
          </F>
          <F label={`Token XanhSM ${integrations.xanhsmToken ? "· đã lưu" : ""}`}>
            <Input type="password" placeholder={mask(integrations.xanhsmToken) || "Nhập token"} value={f.xanhsmToken} onChange={(e) => setF({ ...f, xanhsmToken: e.target.value })} />
          </F>
        </div>
        {integrations.ahamoveTokenFetchedAt ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Token Ahamove hệ thống lấy lúc {new Date(integrations.ahamoveTokenFetchedAt).toLocaleString("vi-VN")} · tự làm mới mỗi tuần
          </p>
        ) : null}
      </Section>

      <Section title="Bản đồ / Khoảng cách">
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <Label className="text-xs">Nhà cung cấp bản đồ pin</Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`rounded-md border px-3 py-1.5 text-sm ${(f.mapProvider ?? "OSM") === "OSM" ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
              onClick={() => setF({ ...f, mapProvider: "OSM" })}
            >
              OpenStreetMap
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-1.5 text-sm ${f.mapProvider === "GOONG" ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
              onClick={() => setF({ ...f, mapProvider: "GOONG" })}
            >
              Goong Map
            </button>
          </div>
          <p className="w-full text-xs text-muted-foreground">
            Đang dùng: {integrations.mapProvider === "GOONG" ? "Goong" : "OpenStreetMap"}
            {integrations.mapProvider === "GOONG" && !integrations.goongMapTilesKey ? " · thiếu Map tiles key → FE fallback OSM" : ""}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label={`Goong REST / Places key ${integrations.goongToken ? "· đã lưu" : ""}`}>
            <Input
              type="password"
              placeholder={mask(integrations.goongToken) || "API key (rsapi.goong.io)"}
              value={f.goongToken}
              onChange={(e) => setF({ ...f, goongToken: e.target.value })}
            />
          </F>
          <F label={`Goong Map tiles key ${integrations.goongMapTilesKey ? "· đã lưu" : ""}`}>
            <Input
              type="password"
              placeholder={mask(integrations.goongMapTilesKey) || "Maptiles key (goong-js)"}
              value={f.goongMapTilesKey}
              onChange={(e) => setF({ ...f, goongMapTilesKey: e.target.value })}
            />
          </F>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          REST key dùng geocode/places; Map tiles key dùng hiển thị bản đồ Goong —{" "}
          <span className="font-medium text-foreground">hai key khác nhau</span> trên{" "}
          <a
            className="underline"
            href="https://account.goong.io"
            target="_blank"
            rel="noreferrer"
          >
            account.goong.io
          </a>
          . Dùng nhầm REST key cho map → nền trắng. OSM không cần key.
        </p>
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
        <Button onClick={save} disabled={saving}>{saving ? "Đang lưu…" : "Lưu"}</Button>
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
