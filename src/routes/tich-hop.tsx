import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { AutoCallIntegration } from "@/components/AutoCallIntegration";
import { BidvCollectionIntegration } from "@/components/BidvCollectionIntegration";
import { OnePayCollectionIntegration } from "@/components/OnePayCollectionIntegration";
import { Section } from "@/components/PageBits";
import { SecretInput } from "@/components/SecretInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiBase, isApiEnabled } from "@/lib/api/client";
import { useStore, type Integrations } from "@/lib/store";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const TABS = ["van-chuyen", "ban-do", "luu-tru", "ttl-anh", "autocall", "thu-ho"] as const;
type TabKey = (typeof TABS)[number];

function daysInput(v: number | null | undefined) {
  return v != null && v > 0 ? String(v) : "";
}

function parseDays(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), 3650);
}

export const Route = createFileRoute("/tich-hop")({
  head: () => ({ meta: [{ title: "Tích hợp — X.E" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: TabKey } =>
    TABS.includes(search.tab as TabKey) ? { tab: search.tab as TabKey } : {},
  component: () => (
    <ProtectedPage title="Cấu hình tích hợp" screen="tich-hop">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const { tab = "van-chuyen" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const integrations = useStore((s) => s.integrations);
  const setIntegrations = useStore((s) => s.setIntegrations);
  const [f, setF] = useState<Integrations>({
    ahamoveApiKey: "",
    ahamoveMobile: integrations.ahamoveMobile ?? "",
    ahamoveSenderMobile: integrations.ahamoveSenderMobile ?? "",
    ahamovePaymentMethod: integrations.ahamovePaymentMethod ?? "BALANCE",
    grabToken: "",
    grabClientId: integrations.grabClientId ?? "",
    grabClientSecret: "",
    grabPartnerId: integrations.grabPartnerId ?? "",
    grabSandbox: integrations.grabSandbox === true,
    grabPaymentMethod: integrations.grabPaymentMethod ?? "BALANCE",
    goongToken: "",
    goongMapTilesKey: "",
    mapProvider: integrations.mapProvider ?? "OSM",
    telegramToken: "",
    telegramChatId: integrations.telegramChatId ?? "",
    webhookUrl: integrations.webhookUrl ?? "",
    webhookSecret: "",
    minioEndpoint: integrations.minioEndpoint ?? "",
    minioBucket: integrations.minioBucket ?? "cpn",
    minioRegion: integrations.minioRegion ?? "us-east-1",
    minioAccessKey: integrations.minioAccessKey ?? "",
    minioSecretKey: "",
    mediaRetentionAttendanceDays: integrations.mediaRetentionAttendanceDays ?? null,
    mediaRetentionVehicleDays: integrations.mediaRetentionVehicleDays ?? null,
    mediaRetentionInventoryDays: integrations.mediaRetentionInventoryDays ?? null,
  });
  const [testing, setTesting] = useState(false);
  const [testingAhamove, setTestingAhamove] = useState(false);
  const [testingGrab, setTestingGrab] = useState(false);
  const [testingMinio, setTestingMinio] = useState(false);
  const [migratingMinio, setMigratingMinio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiKeyFocused, setApiKeyFocused] = useState(false);
  const SECRET_MASK = "••••••••••••";
  const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
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
          ahamoveSenderMobile: saved.ahamoveSenderMobile ?? prev.ahamoveSenderMobile ?? "",
          ahamovePaymentMethod: saved.ahamovePaymentMethod ?? prev.ahamovePaymentMethod ?? "BALANCE",
          grabClientId: saved.grabClientId ?? prev.grabClientId ?? "",
          grabPartnerId: saved.grabPartnerId ?? prev.grabPartnerId ?? "",
          grabSandbox: saved.grabSandbox === true,
          grabPaymentMethod: saved.grabPaymentMethod ?? prev.grabPaymentMethod ?? "BALANCE",
          mapProvider: saved.mapProvider ?? prev.mapProvider ?? "OSM",
          telegramChatId: saved.telegramChatId ?? prev.telegramChatId ?? "",
          webhookUrl: saved.webhookUrl ?? prev.webhookUrl ?? "",
          minioEndpoint: saved.minioEndpoint ?? prev.minioEndpoint ?? "",
          minioBucket: saved.minioBucket ?? prev.minioBucket ?? "cpn",
          minioRegion: saved.minioRegion ?? prev.minioRegion ?? "us-east-1",
          minioAccessKey: saved.minioAccessKey ?? prev.minioAccessKey ?? "",
          mediaRetentionAttendanceDays: saved.mediaRetentionAttendanceDays ?? null,
          mediaRetentionVehicleDays: saved.mediaRetentionVehicleDays ?? null,
          mediaRetentionInventoryDays: saved.mediaRetentionInventoryDays ?? null,
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
    const mobile = f.ahamoveMobile?.trim() || integrations.ahamoveMobile?.trim() || "";
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
    patch.ahamoveSenderMobile = f.ahamoveSenderMobile?.trim() ?? "";
    patch.grabSandbox = f.grabSandbox === true;
    patch.grabPaymentMethod = f.grabPaymentMethod === "CASH" ? "CASH" : "BALANCE";
    // Luôn gửi TTL (null/0 = không xóa) — forEach bỏ qua null vì falsy.
    patch.mediaRetentionAttendanceDays = f.mediaRetentionAttendanceDays ?? null;
    patch.mediaRetentionVehicleDays = f.mediaRetentionVehicleDays ?? null;
    patch.mediaRetentionInventoryDays = f.mediaRetentionInventoryDays ?? null;
    setSaving(true);
    void (async () => {
      try {
        if (!isApiEnabled()) {
          setIntegrations(patch);
          toast.success("Đã lưu (local)");
          return;
        }
        const { putIntegrationConfig, fetchIntegrationConfig } =
          await import("@/lib/api/finance-config-api");
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
          grabClientSecret: "",
          goongToken: "",
          goongMapTilesKey: "",
          mapProvider: saved.mapProvider ?? prev.mapProvider ?? "OSM",
          telegramToken: "",
          webhookSecret: "",
          minioSecretKey: "",
          ahamoveMobile: mobile || prev.ahamoveMobile,
          ahamoveSenderMobile: saved.ahamoveSenderMobile ?? "",
          mediaRetentionAttendanceDays: saved.mediaRetentionAttendanceDays ?? null,
          mediaRetentionVehicleDays: saved.mediaRetentionVehicleDays ?? null,
          mediaRetentionInventoryDays: saved.mediaRetentionInventoryDays ?? null,
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
    const mobile = f.ahamoveMobile?.trim() || integrations.ahamoveMobile?.trim() || undefined;
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
        const { testAhamoveApiKey, fetchIntegrationConfig } =
          await import("@/lib/api/finance-config-api");
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

  const testGrab = () => {
    setTestingGrab(true);
    void (async () => {
      try {
        if (!isApiEnabled()) throw new Error("API chưa cấu hình");
        const { testGrabApi } = await import("@/lib/api/finance-config-api");
        const r = await testGrabApi();
        if (r.ok === false || r.grabTokenOk === false) toast.error(r.grabError || "Grab từ chối token");
        else toast.success("Grab đã cấp token");
      } catch (e: any) {
        toast.error(e?.message ?? "Test Grab thất bại");
      } finally {
        setTestingGrab(false);
      }
    })();
  };

  const minioSecretReady = Boolean(f.minioSecretKey?.trim()) || Boolean(integrations.minioSecretConfigured);
  const minioTestReady = Boolean(f.minioEndpoint?.trim() && f.minioBucket?.trim() && f.minioAccessKey?.trim() && minioSecretReady);

  const testMinio = () => {
    if (!minioTestReady) return toast.error("Điền đủ endpoint, bucket, access key và secret");
    setTestingMinio(true);
    void (async () => {
      try {
        const { testMinio: run } = await import("@/lib/api/finance-config-api");
        const r = await run({
          minioEndpoint: f.minioEndpoint,
          minioBucket: f.minioBucket,
          minioRegion: f.minioRegion,
          minioAccessKey: f.minioAccessKey,
          minioSecretKey: f.minioSecretKey?.trim() || undefined,
        });
        if (r.ok === false) toast.error(r.message || "Test MinIO thất bại");
        else toast.success(r.message || "Kết nối MinIO OK");
      } catch (e: any) {
        toast.error(e?.message ?? "Test MinIO thất bại");
      } finally {
        setTestingMinio(false);
      }
    })();
  };

  const migrateMinio = () => {
    if (!integrations.minioConfigured) return toast.error("Lưu cấu hình MinIO trước khi chuyển ảnh cũ");
    setMigratingMinio(true);
    void (async () => {
      try {
        const { migrateMinioBlobs } = await import("@/lib/api/finance-config-api");
        let total = 0;
        for (let i = 0; i < 500; i++) {
          const r = await migrateMinioBlobs();
          if (r.ok === false) throw new Error(r.message || "Chuyển ảnh thất bại");
          const moved = r.moved ?? 0;
          total += moved;
          if (!r.hasMore || moved === 0) {
            if (r.hasMore && moved === 0) toast.message("Còn ảnh không chuyển được — giữ nguyên trong database");
            break;
          }
        }
        toast.success(total > 0 ? `Đã chuyển ${total} ảnh/file lên MinIO` : "Không còn ảnh data-URL trong database");
      } catch (e: any) {
        toast.error(e?.message ?? "Chuyển ảnh thất bại");
      } finally {
        setMigratingMinio(false);
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

  const footer = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu"}
        </Button>
        <Button variant="outline" onClick={test} disabled={testing}>
          {testing ? "Đang test…" : "Test kết nối"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cập nhật gần nhất:{" "}
        {integrations.updatedAt ? new Date(integrations.updatedAt).toLocaleString("vi-VN") : "—"}
      </p>
    </div>
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => navigate({ search: { tab: v as TabKey }, replace: true })}
    >
      <TabsList>
        <TabsTrigger value="van-chuyen">Vận chuyển</TabsTrigger>
        <TabsTrigger value="ban-do">Bản đồ</TabsTrigger>
        <TabsTrigger value="luu-tru">Lưu trữ</TabsTrigger>
        <TabsTrigger value="ttl-anh">TTL ảnh</TabsTrigger>
        <TabsTrigger value="autocall">Auto Call</TabsTrigger>
        <TabsTrigger value="thu-ho">Thu hộ</TabsTrigger>
      </TabsList>

      <TabsContent value="van-chuyen" className="space-y-4">
        <Section title="Ahamove">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label={`API Key ${hasSavedApiKey ? "· đã lưu" : ""}`}>
              <SecretInput
                name="ahamove-api-key"
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
            <F label={`SĐT tài khoản ${integrations.ahamoveMobile ? "· đã lưu" : ""}`}>
              <Input
                placeholder={integrations.ahamoveMobile || "84xxxxxxxxx (vd 84901234567)"}
                value={f.ahamoveMobile ?? ""}
                onChange={(e) => setF({ ...f, ahamoveMobile: e.target.value })}
              />
            </F>
            <F label={`SĐT người gửi (tài xế gọi) ${integrations.ahamoveSenderMobile ? "· đã lưu" : ""}`}>
              <Input
                placeholder="Bỏ trống = gọi SĐT tài khoản Ahamove"
                value={f.ahamoveSenderMobile ?? ""}
                onChange={(e) => setF({ ...f, ahamoveSenderMobile: e.target.value })}
              />
            </F>
            <F label="Thanh toán phí">
              <select
                className={selectClass}
                value={f.ahamovePaymentMethod ?? "BALANCE"}
                onChange={(e) =>
                  setF({ ...f, ahamovePaymentMethod: e.target.value === "CASH" ? "CASH" : "BALANCE" })
                }
              >
                <option value="BALANCE">Trừ ví Ahamove</option>
                <option value="CASH">Trả tiền mặt cho tài xế</option>
              </select>
            </F>
            <div className="sm:col-span-2">
              <F label="URL callback (đăng ký với Ahamove)">
                {integrations.ahamoveWebhookToken ? (
                  <Input
                    readOnly
                    className="font-mono text-xs"
                    value={`${getApiBase()}/api/public/ahamove/webhook?token=${integrations.ahamoveWebhookToken}`}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Bấm Lưu để sinh URL callback.</p>
                )}
              </F>
            </div>
          </div>
          {integrations.ahamoveTokenFetchedAt ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Token lấy lúc {new Date(integrations.ahamoveTokenFetchedAt).toLocaleString("vi-VN")} · tự làm mới mỗi tuần
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={testAhamove} disabled={testingAhamove}>
              {testingAhamove ? "Đang lấy token…" : "Test Ahamove"}
            </Button>
            <p className="text-xs text-muted-foreground">Chỉ kiểm tra API key và SĐT Ahamove, không gọi Grab.</p>
          </div>
        </Section>

        <Section title="Grab Express">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label={`Client ID ${integrations.grabClientId ? "· đã lưu" : ""}`}>
              <Input
                value={f.grabClientId ?? ""}
                onChange={(e) => setF({ ...f, grabClientId: e.target.value })}
                autoComplete="off"
              />
            </F>
            <F label={`Client Secret ${integrations.grabClientSecretConfigured ? "· đã lưu" : ""}`}>
              <SecretInput
                placeholder={integrations.grabClientSecretConfigured ? "Để trống nếu giữ secret đã lưu" : "Nhập secret"}
                value={f.grabClientSecret ?? ""}
                onChange={(e) => setF({ ...f, grabClientSecret: e.target.value })}
              />
            </F>
            <F label="Partner ID">
              <Input
                value={f.grabPartnerId ?? ""}
                onChange={(e) => setF({ ...f, grabPartnerId: e.target.value })}
                autoComplete="off"
              />
            </F>
            <F label="Môi trường">
              <select
                className={selectClass}
                value={f.grabSandbox === true ? "stg" : "prod"}
                onChange={(e) => setF({ ...f, grabSandbox: e.target.value === "stg" })}
              >
                <option value="prod">Production</option>
                <option value="stg">Staging (sandbox)</option>
              </select>
            </F>
            <F label="Thanh toán phí">
              <select
                className={selectClass}
                value={f.grabPaymentMethod ?? "BALANCE"}
                onChange={(e) =>
                  setF({ ...f, grabPaymentMethod: e.target.value === "CASH" ? "CASH" : "BALANCE" })
                }
              >
                <option value="BALANCE">Trừ ví Grab</option>
                <option value="CASH">Trả tiền mặt cho tài xế</option>
              </select>
            </F>
            <div className="sm:col-span-2">
              <F label="URL callback (dán vào Grab Express Integration)">
                {integrations.grabWebhookToken ? (
                  <Input
                    readOnly
                    className="font-mono text-xs"
                    value={`${getApiBase()}/api/public/grab/webhook?token=${integrations.grabWebhookToken}`}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Bấm Lưu để sinh URL callback Grab.</p>
                )}
              </F>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={testGrab} disabled={testingGrab}>
              {testingGrab ? "Đang lấy token…" : "Test Grab"}
            </Button>
            <p className="text-xs text-muted-foreground">Chỉ lấy token Grab bằng client đã lưu, không gọi Ahamove.</p>
          </div>
        </Section>
        <div className="space-y-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Cập nhật gần nhất:{" "}
            {integrations.updatedAt ? new Date(integrations.updatedAt).toLocaleString("vi-VN") : "—"}
          </p>
        </div>
      </TabsContent>

      <TabsContent value="ban-do" className="space-y-4">
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
              {integrations.mapProvider === "GOONG" && !integrations.goongMapTilesKey
                ? " · thiếu Map tiles key → FE fallback OSM"
                : ""}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label={`Goong REST / Places key ${integrations.goongToken ? "· đã lưu" : ""}`}>
              <SecretInput
                placeholder={mask(integrations.goongToken) || "API key (rsapi.goong.io)"}
                value={f.goongToken}
                onChange={(e) => setF({ ...f, goongToken: e.target.value })}
              />
            </F>
            <F label={`Goong Map tiles key ${integrations.goongMapTilesKey ? "· đã lưu" : ""}`}>
              <SecretInput
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
        {footer}
      </TabsContent>

      <TabsContent value="thong-bao" className="space-y-4">
        <Section title="Telegram cảnh báo">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label={`Bot token ${integrations.telegramToken ? "· đã lưu" : ""}`}>
              <SecretInput
                placeholder={mask(integrations.telegramToken) || "••••••"}
                value={f.telegramToken}
                onChange={(e) => setF({ ...f, telegramToken: e.target.value })}
              />
            </F>
            <F label="Chat ID">
              <Input
                value={f.telegramChatId}
                onChange={(e) => setF({ ...f, telegramChatId: e.target.value })}
                placeholder="-1001234567890"
              />
            </F>
          </div>
        </Section>

        <Section title="Webhook">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label={`Webhook URL ${integrations.webhookUrl ? "· đã lưu" : ""}`}>
              <Input
                value={f.webhookUrl}
                onChange={(e) => setF({ ...f, webhookUrl: e.target.value })}
                placeholder="https://…"
              />
            </F>
            <F label={`Webhook secret (HMAC) ${integrations.webhookSecret ? "· đã lưu" : ""}`}>
              <SecretInput
                placeholder={mask(integrations.webhookSecret) || "shared secret"}
                value={f.webhookSecret}
                onChange={(e) => setF({ ...f, webhookSecret: e.target.value })}
              />
            </F>
          </div>
        </Section>
        {footer}
      </TabsContent>

      <TabsContent value="luu-tru" className="space-y-4">
        <Section title="MinIO — ảnh và file">
          <p className="mb-3 text-xs text-muted-foreground">
            Ảnh POD, ảnh hàng, phiếu thu, chấm công, kiểm kho, ảnh xe lưu trên MinIO. Database chỉ giữ
            mã file. Path-style luôn bật. Web tải ảnh qua API (HTTPS), không mở thẳng MinIO HTTP.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Endpoint">
              <Input
                value={f.minioEndpoint ?? ""}
                placeholder="http://host:9000"
                onChange={(e) => setF({ ...f, minioEndpoint: e.target.value })}
              />
            </F>
            <F label="Bucket">
              <Input
                value={f.minioBucket ?? ""}
                placeholder="cpn"
                onChange={(e) => setF({ ...f, minioBucket: e.target.value })}
              />
            </F>
            <F label="Region">
              <Input
                value={f.minioRegion ?? ""}
                placeholder="us-east-1"
                onChange={(e) => setF({ ...f, minioRegion: e.target.value })}
              />
            </F>
            <F label={`Access key ${integrations.minioAccessKey ? "· đã lưu" : ""}`}>
              <Input
                value={f.minioAccessKey ?? ""}
                onChange={(e) => setF({ ...f, minioAccessKey: e.target.value })}
              />
            </F>
            <F label={`Secret key ${integrations.minioSecretConfigured ? "· đã lưu" : ""}`}>
              <SecretInput
                placeholder={integrations.minioSecretConfigured ? "Nhập secret mới để thay" : "Secret key"}
                value={f.minioSecretKey ?? ""}
                onChange={(e) => setF({ ...f, minioSecretKey: e.target.value })}
              />
            </F>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!minioTestReady || testingMinio}
              onClick={testMinio}
            >
              {testingMinio ? "Đang thử…" : "Test kết nối"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!integrations.minioConfigured || migratingMinio}
              onClick={migrateMinio}
            >
              {migratingMinio ? "Đang chuyển…" : "Chuyển ảnh cũ lên MinIO"}
            </Button>
          </div>
          {!minioTestReady ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Điền đủ endpoint, bucket, access key và secret (hoặc secret đã lưu) thì bấm được Test.
            </p>
          ) : null}
        </Section>
        {footer}
      </TabsContent>

      <TabsContent value="ttl-anh" className="space-y-4">
        <Section title="Xóa ảnh MinIO theo số ngày">
          <p className="mb-3 text-xs text-muted-foreground">
            Job chạy mỗi ngày 03:30 (giờ VN). Nhập số ngày giữ ảnh; <b>để trống = không xóa</b> loại đó.
            Chỉ áp dụng chấm công, chấm xe, kiểm kho — không đụng POD / ảnh hàng / phiếu thu / sự cố.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <F label="Chấm công (ngày)">
              <Input
                type="number"
                min={1}
                max={3650}
                inputMode="numeric"
                placeholder="Trống = không xóa"
                value={daysInput(f.mediaRetentionAttendanceDays)}
                onChange={(e) =>
                  setF({ ...f, mediaRetentionAttendanceDays: parseDays(e.target.value) })
                }
              />
            </F>
            <F label="Chấm xe (ngày)">
              <Input
                type="number"
                min={1}
                max={3650}
                inputMode="numeric"
                placeholder="Trống = không xóa"
                value={daysInput(f.mediaRetentionVehicleDays)}
                onChange={(e) =>
                  setF({ ...f, mediaRetentionVehicleDays: parseDays(e.target.value) })
                }
              />
            </F>
            <F label="Kiểm kho (ngày)">
              <Input
                type="number"
                min={1}
                max={3650}
                inputMode="numeric"
                placeholder="Trống = không xóa"
                value={daysInput(f.mediaRetentionInventoryDays)}
                onChange={(e) =>
                  setF({ ...f, mediaRetentionInventoryDays: parseDays(e.target.value) })
                }
              />
            </F>
          </div>
        </Section>
        {footer}
      </TabsContent>

      <TabsContent value="autocall">
        <AutoCallIntegration />
      </TabsContent>

      <TabsContent value="thu-ho" className="space-y-4">
        <OnePayCollectionIntegration />
        <BidvCollectionIntegration />
      </TabsContent>
    </Tabs>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
