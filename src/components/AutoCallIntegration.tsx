import { AutoCallCallsPanel, AutoCallTestPanel } from "@/components/AutoCallCalls";
import { Section } from "@/components/PageBits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiBase, isApiEnabled } from "@/lib/api/client";
import type { AutoCallAudio, AutoCallResult, AutoCallType } from "@/lib/api/finance-config-api";
import { useStore } from "@/lib/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const DEFAULT_BASE_URL = "https://api.quanlydon.vn/partner/v1";
const TYPE_LABEL: Record<AutoCallType, string> = { giao: "Gọi giao", hoan: "Gọi hoàn" };
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

function detectMode(key: string): "SANDBOX" | "LIVE" | "UNKNOWN" | undefined {
  const k = key.trim();
  if (!k) return undefined;
  if (k.startsWith("xk_test_")) return "SANDBOX";
  if (k.startsWith("xk_live_")) return "LIVE";
  return "UNKNOWN";
}

function ModeBadge({ mode }: { mode?: "SANDBOX" | "LIVE" | "UNKNOWN" }) {
  if (!mode) return null;
  if (mode === "SANDBOX") return <Badge variant="secondary">Sandbox · không gọi thật</Badge>;
  if (mode === "LIVE") return <Badge variant="destructive">Live · gọi thật</Badge>;
  return <Badge variant="outline">Key không rõ loại</Badge>;
}

export function AutoCallIntegration() {
  const integrations = useStore((s) => s.integrations);
  const [enabled, setEnabled] = useState(integrations.autocallEnabled === true);
  const [baseUrl, setBaseUrl] = useState(integrations.autocallBaseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AutoCallResult | null>(null);
  const [audios, setAudios] = useState<AutoCallAudio[] | null>(null);
  const [audioBusy, setAudioBusy] = useState<AutoCallType | null>(null);
  const [preview, setPreview] = useState<{ type: AutoCallType; url: string } | null>(null);
  const fileRefs = { giao: useRef<HTMLInputElement>(null), hoan: useRef<HTMLInputElement>(null) };

  const keySaved = integrations.autocallApiKeyConfigured === true;
  const mode = detectMode(apiKey) ?? integrations.autocallApiKeyMode;

  useEffect(() => {
    setEnabled(integrations.autocallEnabled === true);
    setBaseUrl((prev) => prev || integrations.autocallBaseUrl || "");
  }, [integrations.autocallEnabled, integrations.autocallBaseUrl]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const loadAudios = useCallback(async () => {
    const { fetchAutoCallAudios } = await import("@/lib/api/finance-config-api");
    const r = await fetchAutoCallAudios();
    if (r.ok) {
      setAudios(r.audios ?? []);
    } else {
      setAudios(null);
      setResult(r);
    }
  }, []);

  useEffect(() => {
    if (!isApiEnabled() || !keySaved) return;
    loadAudios().catch(() => undefined);
  }, [keySaved, loadAudios]);

  const save = () => {
    if (enabled && !keySaved && !apiKey.trim()) {
      return toast.error("Bật Auto Call cần API key");
    }
    setSaving(true);
    void (async () => {
      try {
        const { putIntegrationConfig } = await import("@/lib/api/finance-config-api");
        const saved = await putIntegrationConfig({
          autocallEnabled: enabled,
          autocallBaseUrl: baseUrl.trim() || undefined,
          autocallApiKey: apiKey.trim() || undefined,
          autocallWebhookSecret: secret.trim() || undefined,
        });
        useStore.setState({ integrations: saved });
        setApiKey("");
        setSecret("");
        toast.success("Đã lưu cấu hình Auto Call");
      } catch (e: any) {
        toast.error(e?.message ?? "Lưu Auto Call thất bại");
      } finally {
        setSaving(false);
      }
    })();
  };

  const test = () => {
    if (!apiKey.trim() && !keySaved)
      return toast.error("Nhập API key Auto Call (hoặc Lưu key trước)");
    setTesting(true);
    void (async () => {
      try {
        const { testAutoCall } = await import("@/lib/api/finance-config-api");
        const r = await testAutoCall({
          autocallApiKey: apiKey.trim() || undefined,
          autocallBaseUrl: baseUrl.trim() || undefined,
        });
        setResult(r);
        if (r.ok) {
          setAudios(r.audios ?? []);
          toast.success(apiKey.trim() ? "Kết nối OK — bấm Lưu để giữ key này" : "Kết nối HHVN OK");
        } else {
          toast.error(r.message ?? "Test Auto Call thất bại");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Test Auto Call thất bại");
      } finally {
        setTesting(false);
      }
    })();
  };

  const upload = (type: AutoCallType, file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["mp3", "wav", "m4a"].includes(ext)) return toast.error("Chỉ nhận file MP3, WAV hoặc M4A");
    if (file.size > MAX_AUDIO_BYTES) return toast.error("File audio lớn hơn 5 MB");
    setAudioBusy(type);
    void (async () => {
      try {
        const { uploadAutoCallAudio } = await import("@/lib/api/finance-config-api");
        const r = await uploadAutoCallAudio(type, file);
        if (!r.ok) {
          toast.error(r.message ?? "Tải audio thất bại");
          return;
        }
        toast.success(`Đã thay file ${TYPE_LABEL[type].toLowerCase()}`);
        setPreview(null);
        await loadAudios();
      } catch (e: any) {
        toast.error(e?.message ?? "Tải audio thất bại");
      } finally {
        setAudioBusy(null);
        const input = fileRefs[type].current;
        if (input) input.value = "";
      }
    })();
  };

  const resetDefault = (type: AutoCallType) => {
    if (
      !window.confirm(
        `Xoá file riêng, quay về file mặc định của tổng đài cho "${TYPE_LABEL[type]}"?`,
      )
    )
      return;
    setAudioBusy(type);
    void (async () => {
      try {
        const { deleteAutoCallAudio } = await import("@/lib/api/finance-config-api");
        const r = await deleteAutoCallAudio(type);
        if (!r.ok) {
          toast.error(r.message ?? "Xoá audio thất bại");
          return;
        }
        toast.success("Đã quay về file mặc định");
        setPreview(null);
        await loadAudios();
      } catch (e: any) {
        toast.error(e?.message ?? "Xoá audio thất bại");
      } finally {
        setAudioBusy(null);
      }
    })();
  };

  const listen = (type: AutoCallType) => {
    setAudioBusy(type);
    void (async () => {
      try {
        const { fetchAutoCallAudioBlob } = await import("@/lib/api/finance-config-api");
        const blob = await fetchAutoCallAudioBlob(type);
        setPreview({ type, url: URL.createObjectURL(blob) });
      } catch (e: any) {
        toast.error(e?.message ?? "Không tải được file audio");
      } finally {
        setAudioBusy(null);
      }
    })();
  };

  if (!isApiEnabled()) {
    return (
      <Section title="Auto Call (HHVN Tech)">
        <p className="text-sm text-muted-foreground">
          Cần kết nối API máy chủ để cấu hình Auto Call.
        </p>
      </Section>
    );
  }

  const needKey = <p className="text-xs text-muted-foreground">Lưu API key ở tab Kết nối trước.</p>;

  return (
    <Section title="Auto Call (HHVN Tech)" right={<ModeBadge mode={mode} />}>
      <Tabs defaultValue="ket-noi">
        <TabsList>
          <TabsTrigger value="ket-noi">Kết nối</TabsTrigger>
          <TabsTrigger value="file">File thông báo</TabsTrigger>
          <TabsTrigger value="cuoc-goi">Cuộc gọi</TabsTrigger>
          <TabsTrigger value="goi-thu">Gọi thử</TabsTrigger>
        </TabsList>

        <TabsContent value="ket-noi" className="pt-2">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Switch id="autocall-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="autocall-enabled" className="text-sm">
              Bật Auto Call {integrations.autocallEnabled ? "· đang bật" : "· đang tắt"}
            </Label>
            <span className="text-xs text-muted-foreground">
              Khi bật: đơn nhập kho giao (hoặc quay về kho sau giao thất bại) tự gọi người nhận.
            </span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            URL webhook gửi HHVN Tech:{" "}
            <span className="select-all font-mono text-foreground">{`${getApiBase()}/api/public/hhvn/webhook`}</span>
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <F label="Base URL">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={DEFAULT_BASE_URL}
              />
            </F>
            <F
              label={`API Key ${keySaved ? `· đã lưu${integrations.autocallApiKeySuffix ? ` (…${integrations.autocallApiKeySuffix})` : ""}` : ""}`}
            >
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keySaved ? "Nhập key mới để thay" : "xk_test_… hoặc xk_live_…"}
              />
            </F>
            <F
              label={`Webhook secret ${integrations.autocallWebhookSecretConfigured ? "· đã lưu" : ""}`}
            >
              <Input
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={
                  integrations.autocallWebhookSecretConfigured
                    ? "Nhập secret mới để thay"
                    : "whsec_…"
                }
              />
            </F>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu Auto Call"}
            </Button>
            <Button type="button" variant="secondary" onClick={test} disabled={testing}>
              {testing
                ? "Đang test…"
                : apiKey.trim()
                  ? "Test key vừa nhập"
                  : "Test kết nối Auto Call"}
            </Button>
          </div>

          {result ? <TestResult r={result} /> : null}
        </TabsContent>

        <TabsContent value="file" className="pt-2">
          <div>
            {mode === "SANDBOX" ? (
              <p className="mb-2 text-xs text-muted-foreground">
                Key sandbox: file lưu cấu hình test riêng, không ảnh hưởng cuộc gọi thật
              </p>
            ) : null}
            {!keySaved ? (
              needKey
            ) : audios == null ? (
              <p className="text-xs text-muted-foreground">
                Chưa tải được danh sách audio — bấm Test kết nối.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Loại</th>
                      <th className="px-3 py-2 text-left font-medium">Nguồn</th>
                      <th className="px-3 py-2 text-left font-medium">Thời lượng</th>
                      <th className="px-3 py-2 text-left font-medium">File gốc</th>
                      <th className="px-3 py-2 text-left font-medium">Cập nhật</th>
                      <th className="px-3 py-2 text-right font-medium">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["giao", "hoan"] as AutoCallType[]).map((type) => {
                      const a = audios.find((x) => x.type === type);
                      const busy = audioBusy === type;
                      return (
                        <tr key={type} className="border-t align-middle">
                          <td className="px-3 py-2 font-medium">
                            {TYPE_LABEL[type]}
                            {type === "hoan" ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (không ghi âm)
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {a?.source === "custom" ? (
                              <Badge>Tự tải lên</Badge>
                            ) : (
                              <Badge variant="outline">Mặc định tổng đài</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {a?.duration != null ? `${a.duration}s` : "—"}
                          </td>
                          <td className="px-3 py-2">{a?.originalName ?? "—"}</td>
                          <td className="px-3 py-2">
                            {a?.updatedAt ? new Date(a.updatedAt).toLocaleString("vi-VN") : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1.5">
                              {a?.source === "custom" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => listen(type)}
                                >
                                  Nghe
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => fileRefs[type].current?.click()}
                              >
                                {busy ? "Đang xử lý…" : "Tải file mới"}
                              </Button>
                              {a?.source === "custom" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => resetDefault(type)}
                                >
                                  Về mặc định
                                </Button>
                              ) : null}
                              <input
                                ref={fileRefs[type]}
                                type="file"
                                accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4"
                                className="hidden"
                                onChange={(e) => upload(type, e.target.files?.[0])}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {preview ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {TYPE_LABEL[preview.type]} (sau chuyển đổi 8 kHz):
                </span>
                <audio controls autoPlay src={preview.url} className="h-8" />
              </div>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              MP3 / WAV / M4A, tối đa 5 MB, dài 2–60 giây. Tối đa 10 lần tải lên mỗi giờ. File mới
              áp dụng cho lượt gọi bắt đầu sau khi tải lên.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="cuoc-goi" className="pt-2">
          {keySaved ? <AutoCallCallsPanel /> : needKey}
        </TabsContent>

        {/* Giữ danh sách gọi thử khi chuyển tab con. */}
        <TabsContent value="goi-thu" forceMount className="pt-2 data-[state=inactive]:hidden">
          {keySaved ? <AutoCallTestPanel mode={integrations.autocallApiKeyMode} /> : needKey}
        </TabsContent>
      </Tabs>
    </Section>
  );
}

function TestResult({ r }: { r: AutoCallResult }) {
  if (r.ok) {
    return (
      <p className="mt-2 text-xs text-emerald-600">
        ✓ {r.message ?? "Kết nối OK"} · {r.baseUrl}
        {r.testedAt ? ` · ${new Date(r.testedAt).toLocaleString("vi-VN")}` : ""}
      </p>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
      <div>
        {r.message ?? "Kết nối thất bại"}
        {r.httpStatus ? ` · HTTP ${r.httpStatus}` : ""}
      </div>
      {r.code === "IP_NOT_ALLOWED" ? (
        <div className="mt-1 text-foreground">
          IP ra của máy chủ:{" "}
          <span className="font-mono font-medium">{r.serverOutboundIp ?? "không xác định"}</span> —
          gửi IP này cho HHVN Tech để whitelist. Railway cần bật Static Outbound IP, nếu không IP sẽ
          đổi sau mỗi lần deploy.
        </div>
      ) : null}
    </div>
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
