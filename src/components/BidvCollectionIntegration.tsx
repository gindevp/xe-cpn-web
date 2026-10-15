import { Section } from "@/components/PageBits";
import { SecretInput } from "@/components/SecretInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiBase, isApiEnabled } from "@/lib/api/client";
import type { BidvCallLog, BidvConfig, BidvSample, BidvTestBill } from "@/lib/api/bidv-api";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const RESULT_LABEL: Record<string, string> = {
  "000": "Thành công",
  "001": "Sai định dạng / thiếu trường",
  "002": "IP không được phép",
  "003": "Sai API key",
  "004": "Sai checksum",
  "005": "Lỗi kết nối",
  "006": "Sai mã dịch vụ",
  "011": "Không có khoản phải thu",
  "012": "Mã KH bị khoá",
  "021": "Sai mã hoá đơn",
  "022": "Sai số tiền",
  "023": "Đã thanh toán / trùng giao dịch",
  "024": "Hết hạn",
  "031": "Lỗi hệ thống / đang tắt",
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("vi-VN")} đ`;
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("vi-VN") : "—");

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success("Đã copy"),
    () => toast.error("Không copy được"),
  );
}

async function api() {
  return import("@/lib/api/bidv-api");
}

export function BidvCollectionIntegration() {
  const [cfg, setCfg] = useState<BidvConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { fetchBidvConfig } = await api();
      setCfg(await fetchBidvConfig());
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message ?? "Không tải được cấu hình BIDV");
    }
  }, []);

  useEffect(() => {
    if (isApiEnabled()) reload().catch(() => undefined);
  }, [reload]);

  if (!isApiEnabled()) {
    return (
      <Section title="Thu hộ BIDV">
        <p className="text-sm text-muted-foreground">
          Cần kết nối API máy chủ để cấu hình thu hộ BIDV.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="Thu hộ định danh BIDV"
      right={
        <div className="flex gap-1.5">
          <Badge variant="secondary">Chế độ TEST · chỉ hoá đơn test</Badge>
          {cfg ? (
            cfg.enabled ? (
              <Badge>Đang bật</Badge>
            ) : (
              <Badge variant="outline">Đang tắt</Badge>
            )
          ) : null}
        </div>
      }
    >
      {loadError ? <p className="mb-2 text-sm text-destructive">{loadError}</p> : null}
      <Tabs defaultValue="ket-noi">
        <TabsList>
          <TabsTrigger value="ket-noi">Kết nối</TabsTrigger>
          <TabsTrigger value="hoa-don">Hoá đơn test</TabsTrigger>
          <TabsTrigger value="nhat-ky">Nhật ký callback</TabsTrigger>
        </TabsList>
        <TabsContent value="ket-noi" className="pt-2">
          {cfg ? <ConnectionPanel cfg={cfg} onSaved={setCfg} /> : null}
        </TabsContent>
        <TabsContent value="hoa-don" className="pt-2">
          <TestBillsPanel cfg={cfg} />
        </TabsContent>
        <TabsContent value="nhat-ky" className="pt-2">
          <LogsPanel />
        </TabsContent>
      </Tabs>
    </Section>
  );
}

function ConnectionPanel({ cfg, onSaved }: { cfg: BidvConfig; onSaved: (c: BidvConfig) => void }) {
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [serviceId, setServiceId] = useState(cfg.serviceId ?? "");
  const [secret, setSecret] = useState("");
  const [vaPrefix, setVaPrefix] = useState(cfg.vaPrefix ?? "");
  const [allowedIps, setAllowedIps] = useState(cfg.allowedIps ?? "");
  const [apiKeyRequired, setApiKeyRequired] = useState(cfg.apiKeyRequired);
  const [checksumRequired, setChecksumRequired] = useState(cfg.checksumRequired);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  const base = getApiBase();
  const urls = [
    { label: "getbill (truy vấn)", url: `${base}/api/public/bidv/getbill` },
    { label: "paybill (gạch nợ)", url: `${base}/api/public/bidv/paybill` },
  ];

  const save = () => {
    if (enabled && !serviceId.trim())
      return toast.error("Bật thu hộ cần nhập mã dịch vụ (serviceId)");
    if (enabled && checksumRequired && !cfg.secretConfigured && !secret.trim())
      return toast.error("Bật kiểm checksum cần nhập secret code BIDV cấp");
    setSaving(true);
    void (async () => {
      try {
        const { putBidvConfig } = await api();
        const saved = await putBidvConfig({
          enabled,
          serviceId: serviceId.trim(),
          secretCode: secret.trim() || undefined,
          vaPrefix: vaPrefix.trim(),
          allowedIps: allowedIps.trim(),
          apiKeyRequired,
          checksumRequired,
        });
        onSaved(saved);
        setSecret("");
        toast.success("Đã lưu cấu hình thu hộ BIDV");
      } catch (e: any) {
        toast.error(e?.message ?? "Lưu cấu hình BIDV thất bại");
      } finally {
        setSaving(false);
      }
    })();
  };

  const rotate = () => {
    if (
      cfg.apiKey &&
      !window.confirm("Tạo API key mới? Key cũ hết hiệu lực ngay, BIDV phải cập nhật key mới.")
    )
      return;
    setRotating(true);
    void (async () => {
      try {
        const { regenerateBidvApiKey } = await api();
        onSaved(await regenerateBidvApiKey());
        toast.success("Đã tạo API key mới");
      } catch (e: any) {
        toast.error(e?.message ?? "Tạo API key thất bại");
      } finally {
        setRotating(false);
      }
    })();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Switch id="bidv-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="bidv-enabled" className="text-sm">
          Nhận callback BIDV {cfg.enabled ? "· đang bật" : "· đang tắt"}
        </Label>
        <span className="text-xs text-muted-foreground">
          Khi tắt, mọi lệnh getbill/paybill trả mã 031. Chế độ TEST chỉ trả và gạch nợ hoá đơn ở tab
          Hoá đơn test, không đụng đơn hàng / phiếu thu thật.
        </span>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-xs">
        <div className="mb-1.5 font-medium">URL đăng ký với BIDV</div>
        {urls.map((u) => (
          <div key={u.url} className="flex flex-wrap items-center gap-2 py-0.5">
            <span className="w-32 text-muted-foreground">{u.label}</span>
            <span className="select-all break-all font-mono">{u.url}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6"
              onClick={() => copy(u.url)}
            >
              Copy
            </Button>
          </div>
        ))}
        <p className="mt-1.5 text-muted-foreground">
          Phương thức POST, body JSON. CPN luôn trả HTTP 200 kèm{" "}
          <span className="font-mono">result_code</span>.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <F label="Mã dịch vụ (serviceId) BIDV cấp">
          <Input
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            placeholder="VD: XECPN"
          />
        </F>
        <F label={`Secret code checksum ${cfg.secretConfigured ? "· đã lưu" : ""}`}>
          <SecretInput
            name="bidv-secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={cfg.secretConfigured ? "Nhập secret mới để thay" : "BIDV cấp"}
          />
        </F>
        <F label="Tiền tố tài khoản định danh">
          <Input
            value={vaPrefix}
            onChange={(e) => setVaPrefix(e.target.value)}
            placeholder="VD: V3XVN"
          />
        </F>
      </div>

      <F label="IP BIDV được phép gọi (mỗi dòng hoặc dấu phẩy, hỗ trợ CIDR — bỏ trống = không chặn IP)">
        <textarea
          className="min-h-[64px] w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
          value={allowedIps}
          onChange={(e) => setAllowedIps(e.target.value)}
          placeholder={"203.0.113.10\n198.51.100.0/24"}
        />
      </F>

      <div className="rounded-md border p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">API key cấp cho BIDV</span>
          <span className="text-xs text-muted-foreground">
            BIDV gửi trong header <span className="font-mono">X-API-KEY</span> hoặc{" "}
            <span className="font-mono">Authorization: Bearer</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cfg.apiKey ? (
            <>
              <span className="select-all break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                {cfg.apiKey}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => copy(cfg.apiKey ?? "")}
              >
                Copy
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Chưa có key</span>
          )}
          <Button type="button" size="sm" variant="outline" onClick={rotate} disabled={rotating}>
            {rotating ? "Đang tạo…" : cfg.apiKey ? "Tạo key mới" : "Tạo API key"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="bidv-key-required"
            checked={apiKeyRequired}
            onCheckedChange={setApiKeyRequired}
          />
          <Label htmlFor="bidv-key-required" className="text-sm">
            Bắt buộc API key
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="bidv-checksum-required"
            checked={checksumRequired}
            onCheckedChange={setChecksumRequired}
          />
          <Label htmlFor="bidv-checksum-required" className="text-sm">
            Bắt buộc checksum
          </Label>
        </div>
        <span className="text-xs text-muted-foreground">
          Chỉ tắt tạm khi BIDV chưa gửi kèm; key/checksum gửi sai vẫn luôn bị từ chối.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu cấu hình BIDV"}
        </Button>
        <span className="text-xs text-muted-foreground">Cập nhật: {when(cfg.updatedAt)}</span>
      </div>
    </div>
  );
}

function TestBillsPanel({ cfg }: { cfg: BidvConfig | null }) {
  const [bills, setBills] = useState<BidvTestBill[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState("");
  const [remark, setRemark] = useState("");
  const [sample, setSample] = useState<BidvSample | null>(null);

  const load = useCallback(async () => {
    try {
      const { fetchBidvTestBills } = await api();
      setBills(await fetchBidvTestBills());
    } catch (e: any) {
      toast.error(e?.message ?? "Không tải được hoá đơn test");
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const run = (fn: () => Promise<BidvTestBill[]>, okMsg: string) => {
    setBusy(true);
    void (async () => {
      try {
        setBills(await fn());
        toast.success(okMsg);
      } catch (e: any) {
        toast.error(e?.message ?? "Thao tác thất bại");
      } finally {
        setBusy(false);
      }
    })();
  };

  const add = () => {
    const code = customerId.trim().toUpperCase();
    const amt = Math.round(Number(amount));
    if (!/^[A-Z0-9]{1,13}$/.test(code)) return toast.error("Mã KH: 1–13 ký tự chữ/số, không dấu");
    if (!customerName.trim()) return toast.error("Nhập tên khách hàng");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Số tiền phải là số nguyên dương");
    run(async () => {
      const { addBidvTestBill } = await api();
      const r = await addBidvTestBill({
        customerId: code,
        customerName: customerName.trim(),
        amount: amt,
        remark: remark.trim() || undefined,
      });
      setCustomerId("");
      setCustomerName("");
      setAmount("");
      setRemark("");
      return r;
    }, "Đã thêm hoá đơn test");
  };

  const remove = (b: BidvTestBill) => {
    if (!window.confirm(`Xoá hoá đơn test ${b.customerId}?`)) return;
    run(async () => (await api()).deleteBidvTestBill(b.id), "Đã xoá");
  };

  const reset = () => {
    if (!window.confirm("Xoá trạng thái đã thanh toán của mọi hoá đơn test để BIDV test lại?"))
      return;
    run(async () => (await api()).resetBidvTestPayments(), "Đã đặt lại trạng thái");
  };

  const makeSample = (b: BidvTestBill, type: "getbill" | "paybill") => {
    void (async () => {
      try {
        const { buildBidvSample } = await api();
        setSample(
          await buildBidvSample({
            type,
            customerId: b.virtualAccount,
            amount: b.amount,
            transId: type === "paybill" ? `TEST${Date.now()}` : undefined,
          }),
        );
      } catch (e: any) {
        toast.error(e?.message ?? "Không tạo được request mẫu");
      }
    })();
  };

  const curl = sample
    ? [
        `curl -X POST '${getApiBase()}${sample.path}'`,
        `  -H 'Content-Type: application/json'`,
        ...(cfg?.apiKey ? [`  -H 'X-API-KEY: ${cfg.apiKey}'`] : []),
        `  -d '${JSON.stringify(sample.body)}'`,
      ].join(" \\\n")
    : "";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        BIDV dùng các mã dưới đây để test: getbill trả hoá đơn chưa thanh toán, paybill gạch nợ đúng
        số tiền. Số TK định danh = tiền tố + mã KH (BIDV gửi cả hai dạng đều được).
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[140px_1fr_140px_1fr_auto]">
        <Input
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          placeholder="Mã KH (≤13)"
        />
        <Input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Tên khách hàng"
        />
        <Input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Số tiền"
        />
        <Input
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Nội dung (tuỳ chọn)"
        />
        <Button type="button" onClick={add} disabled={busy}>
          Thêm
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Số TK định danh</th>
              <th className="px-3 py-2 text-left font-medium">Khách hàng</th>
              <th className="px-3 py-2 text-right font-medium">Số tiền</th>
              <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {bills == null ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  Đang tải…
                </td>
              </tr>
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  Chưa có hoá đơn test
                </td>
              </tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id} className="border-t align-middle">
                  <td className="px-3 py-2 font-mono">{b.virtualAccount}</td>
                  <td className="px-3 py-2">
                    {b.customerName}
                    {b.remark ? (
                      <div className="text-xs text-muted-foreground">{b.remark}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">{money(b.amount)}</td>
                  <td className="px-3 py-2">
                    {b.paidTransId ? (
                      <div>
                        <Badge>Đã gạch nợ</Badge>
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {b.paidTransId} · {when(b.paidAt)}
                        </div>
                      </div>
                    ) : (
                      <Badge variant="outline">Chưa thanh toán</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => makeSample(b, "getbill")}
                      >
                        Mẫu getbill
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => makeSample(b, "paybill")}
                      >
                        Mẫu paybill
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => remove(b)}
                      >
                        Xoá
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={reset} disabled={busy}>
        Đặt lại trạng thái thanh toán
      </Button>

      {sample ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">Request mẫu · {sample.path}</span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6"
                onClick={() => copy(curl)}
              >
                Copy curl
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6"
                onClick={() => setSample(null)}
              >
                Đóng
              </Button>
            </div>
          </div>
          <div>
            Chuỗi băm checksum: <span className="font-mono">{sample.checksumInput}</span>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono">
            {curl}
          </pre>
          <p className="text-muted-foreground">
            Gửi mẫu này cho BIDV để đối chiếu công thức checksum, hoặc chạy curl để tự test. Gọi
            paybill bằng mẫu sẽ gạch nợ hoá đơn test thật — bấm "Đặt lại" để test lại.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function LogsPanel() {
  const [logs, setLogs] = useState<BidvCallLog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void (async () => {
      try {
        const { fetchBidvLogs } = await api();
        setLogs(await fetchBidvLogs(200));
      } catch (e: any) {
        toast.error(e?.message ?? "Không tải được nhật ký");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới"}
        </Button>
        <span className="text-xs text-muted-foreground">200 lệnh gần nhất BIDV gọi vào CPN</span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Thời gian</th>
              <th className="px-3 py-2 text-left font-medium">Lệnh</th>
              <th className="px-3 py-2 text-left font-medium">IP</th>
              <th className="px-3 py-2 text-left font-medium">Mã KH / GD</th>
              <th className="px-3 py-2 text-right font-medium">Số tiền</th>
              <th className="px-3 py-2 text-left font-medium">Kết quả</th>
              <th className="px-3 py-2 text-left font-medium">Checksum</th>
              <th className="px-3 py-2 text-right font-medium">ms</th>
            </tr>
          </thead>
          <tbody>
            {!logs || logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  {logs ? "Chưa có lệnh nào" : "Đang tải…"}
                </td>
              </tr>
            ) : (
              logs.flatMap((l) => {
                const ok = l.resultCode === "000";
                const rows = [
                  <tr
                    key={l.id}
                    className="cursor-pointer border-t align-top hover:bg-muted/30"
                    onClick={() => setOpen(open === l.id ? null : l.id)}
                  >
                    <td className="whitespace-nowrap px-3 py-2">{when(l.calledAt)}</td>
                    <td className="px-3 py-2 font-mono">{l.endpoint}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.clientIp ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.customerId ?? "—"}
                      {l.transId ? <div className="text-muted-foreground">{l.transId}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{money(l.amount)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={ok ? "default" : "destructive"}>{l.resultCode ?? "?"}</Badge>{" "}
                      <span className="text-xs">
                        {l.resultCode ? (RESULT_LABEL[l.resultCode] ?? l.resultDesc) : l.resultDesc}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{l.checksumVariant ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-xs">{l.durationMs ?? "—"}</td>
                  </tr>,
                ];
                if (open === l.id) {
                  rows.push(
                    <tr key={`${l.id}-body`} className="bg-muted/20">
                      <td colSpan={8} className="px-3 py-2">
                        <div className="grid gap-2 text-xs md:grid-cols-2">
                          <div>
                            <div className="mb-1 font-medium">Request</div>
                            <pre className="whitespace-pre-wrap break-all font-mono">
                              {l.requestBody ?? "—"}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 font-medium">Response</div>
                            <pre className="whitespace-pre-wrap break-all font-mono">
                              {l.responseBody ?? "—"}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Bấm vào dòng để xem request / response gốc.</p>
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
