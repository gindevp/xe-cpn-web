import { Section } from "@/components/PageBits";
import { SecretInput } from "@/components/SecretInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiBase, isApiEnabled } from "@/lib/api/client";
import type {
  OnePayCallLog,
  OnePayConfig,
  OnePayInvoice,
  OnePayInvoiceState,
  OnePaySampleIpn,
} from "@/lib/api/onepay-api";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const IPN_PATH = "/api/public/onepay/ipn";

const STATE_LABEL: Record<OnePayInvoiceState, string> = {
  UNPAID: "Chưa thanh toán",
  PAID: "Đã thanh toán",
  EXPIRED: "Hết hạn",
  AMOUNT_MISMATCH: "Lệch số tiền",
};

const RESULT_LABEL: Record<string, string> = {
  OK: "Thành công",
  ERROR: "Lỗi",
  PAID: "Ghi nhận thanh toán",
  AMOUNT_MISMATCH: "Lệch số tiền",
  EXTRA_PAYMENT: "Tiền về thêm",
  DUPLICATE: "Gửi lại (đã ghi)",
  UNMATCHED: "Không khớp hoá đơn",
  IGNORED_STATE: "Bỏ qua trạng thái",
  BAD_SIGNATURE: "Sai chữ ký",
  WRONG_MERCHANT: "Sai merchant",
  BAD_REQUEST: "Sai dữ liệu",
  DISABLED: "Đang tắt",
  SYSTEM_ERROR: "Lỗi hệ thống",
};

const GOOD_RESULTS = new Set(["OK", "PAID", "DUPLICATE"]);

const money = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("vi-VN")} đ`;
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("vi-VN") : "—");

function apiOrigin() {
  return getApiBase() || window.location.origin;
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success("Đã copy"),
    () => toast.error("Không copy được"),
  );
}

async function api() {
  return import("@/lib/api/onepay-api");
}

export function OnePayCollectionIntegration() {
  const [cfg, setCfg] = useState<OnePayConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { fetchOnePayConfig } = await api();
      setCfg(await fetchOnePayConfig());
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message ?? "Không tải được cấu hình OnePay");
    }
  }, []);

  useEffect(() => {
    if (isApiEnabled()) reload().catch(() => undefined);
  }, [reload]);

  if (!isApiEnabled()) {
    return (
      <Section title="Thu hộ OnePay">
        <p className="text-sm text-muted-foreground">
          Cần kết nối API máy chủ để cấu hình thu hộ OnePay.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="Thu hộ OnePay PayCollect (tài khoản ảo)"
      right={
        <div className="flex gap-1.5">
          <Badge variant="secondary">Chế độ TEST · chỉ hoá đơn test</Badge>
          {cfg ? (
            <Badge variant={cfg.environment === "PRODUCTION" ? "default" : "outline"}>
              {cfg.environment === "PRODUCTION" ? "Môi trường thật" : "Sandbox"}
            </Badge>
          ) : null}
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
          <TabsTrigger value="nhat-ky">Nhật ký</TabsTrigger>
        </TabsList>
        <TabsContent value="ket-noi" className="pt-2">
          {cfg ? <ConnectionPanel cfg={cfg} onSaved={setCfg} /> : null}
        </TabsContent>
        <TabsContent value="hoa-don" className="pt-2">
          <InvoicesPanel cfg={cfg} />
        </TabsContent>
        <TabsContent value="nhat-ky" className="pt-2">
          <LogsPanel />
        </TabsContent>
      </Tabs>
    </Section>
  );
}

function ConnectionPanel({
  cfg,
  onSaved,
}: {
  cfg: OnePayConfig;
  onSaved: (c: OnePayConfig) => void;
}) {
  const defaultIpn = `${apiOrigin()}${IPN_PATH}`;
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [environment, setEnvironment] = useState(cfg.environment);
  const [partnerId, setPartnerId] = useState(cfg.partnerId ?? "");
  const [partnerKey, setPartnerKey] = useState("");
  const [bankSwift, setBankSwift] = useState(cfg.bankSwift ?? "BIDVVNVX");
  const [ipnUrl, setIpnUrl] = useState(cfg.ipnUrl ?? defaultIpn);
  const [ttl, setTtl] = useState(String(cfg.invoiceTtlHours));
  const [signatureRequired, setSignatureRequired] = useState(cfg.signatureRequired);
  const [insecureSsl, setInsecureSsl] = useState(cfg.insecureSsl);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = () => {
    const hours = Math.round(Number(ttl));
    if (!Number.isFinite(hours) || hours < 1)
      return toast.error("Thời hạn hoá đơn tối thiểu 1 giờ");
    if (enabled && !partnerId.trim()) return toast.error("Bật OnePay cần nhập Partner ID");
    if (enabled && !cfg.partnerKeyConfigured && !partnerKey.trim())
      return toast.error("Bật OnePay cần nhập Partner key");
    if (
      environment === "PRODUCTION" &&
      cfg.environment !== "PRODUCTION" &&
      !window.confirm(
        "Chuyển sang môi trường thật onepay.vn? Tiền chuyển vào tài khoản ảo là tiền thật.",
      )
    )
      return;
    setSaving(true);
    void (async () => {
      try {
        const { putOnePayConfig } = await api();
        const saved = await putOnePayConfig({
          enabled,
          environment,
          partnerId: partnerId.trim(),
          partnerKey: partnerKey.trim() || undefined,
          bankSwift: bankSwift.trim(),
          ipnUrl: ipnUrl.trim(),
          invoiceTtlHours: hours,
          signatureRequired,
          insecureSsl,
        });
        onSaved(saved);
        setPartnerKey("");
        toast.success("Đã lưu cấu hình OnePay");
      } catch (e: any) {
        toast.error(e?.message ?? "Lưu cấu hình OnePay thất bại");
      } finally {
        setSaving(false);
      }
    })();
  };

  const test = () => {
    setTesting(true);
    void (async () => {
      try {
        const { testOnePayConnection } = await api();
        const r = await testOnePayConnection();
        if (r.ok) toast.success(r.message);
        else toast.error(r.message);
      } catch (e: any) {
        toast.error(e?.message ?? "Test kết nối thất bại");
      } finally {
        setTesting(false);
      }
    })();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Switch id="onepay-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="onepay-enabled" className="text-sm">
          Thu hộ OnePay {cfg.enabled ? "· đang bật" : "· đang tắt"}
        </Label>
        <span className="text-xs text-muted-foreground">
          Khi tắt, IPN OnePay gọi về bị từ chối và không tạo được hoá đơn. Chế độ TEST chỉ ghi nhận
          tiền cho hoá đơn test, không đụng đơn hàng / phiếu thu thật.
        </span>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-xs">
        <div className="mb-1.5 font-medium">URL IPN gửi OnePay cấu hình</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="select-all break-all font-mono">{ipnUrl || defaultIpn}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6"
            onClick={() => copy(ipnUrl || defaultIpn)}
          >
            Copy
          </Button>
        </div>
        <p className="mt-1.5 text-muted-foreground">
          OnePay gọi <span className="font-mono">PUT {IPN_PATH}?id=…</span>, ký OWS1 bằng partner
          key. CPN trả <span className="font-mono">{'{"error_code":"0"}'}</span> khi đã nhận; trả
          lỗi thì OnePay gửi lại 3 lần, cách nhau 5 phút.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <F label="Môi trường">
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as OnePayConfig["environment"])}
          >
            <option value="SANDBOX">Sandbox · mtf.onepay.vn</option>
            <option value="PRODUCTION">Thật · onepay.vn</option>
          </select>
        </F>
        <F label="Partner ID (merchant_id)">
          <Input
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            placeholder="Sandbox: TESTPC1"
          />
        </F>
        <F label={`Partner key ${cfg.partnerKeyConfigured ? "· đã lưu" : ""}`}>
          <SecretInput
            name="onepay-partner-key"
            value={partnerKey}
            onChange={(e) => setPartnerKey(e.target.value)}
            placeholder={cfg.partnerKeyConfigured ? "Nhập key mới để thay" : "OnePay cấp"}
          />
        </F>
        <F label="Ngân hàng tài khoản ảo (SWIFT)">
          <Input
            value={bankSwift}
            onChange={(e) => setBankSwift(e.target.value)}
            placeholder="BIDVVNVX"
          />
        </F>
        <F label="Thời hạn hoá đơn (giờ)">
          <Input type="number" min={1} value={ttl} onChange={(e) => setTtl(e.target.value)} />
        </F>
      </div>

      <F label="URL IPN đã đăng ký với OnePay (dùng để kiểm chữ ký — phải trùng URL OnePay gọi)">
        <div className="flex gap-2">
          <Input
            value={ipnUrl}
            onChange={(e) => setIpnUrl(e.target.value)}
            placeholder={defaultIpn}
            className="font-mono"
          />
          <Button type="button" variant="outline" onClick={() => setIpnUrl(defaultIpn)}>
            Mặc định
          </Button>
        </div>
      </F>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="onepay-sig-required"
            checked={signatureRequired}
            onCheckedChange={setSignatureRequired}
          />
          <Label htmlFor="onepay-sig-required" className="text-sm">
            Bắt buộc chữ ký IPN hợp lệ
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="onepay-insecure" checked={insecureSsl} onCheckedChange={setInsecureSsl} />
          <Label htmlFor="onepay-insecure" className="text-sm">
            Bỏ kiểm chứng chỉ SSL khi gọi OnePay
          </Label>
        </div>
        <span className="text-xs text-muted-foreground">
          Chỉ tắt chữ ký tạm thời khi dò lỗi ký với OnePay. Chỉ bật bỏ SSL khi máy chủ báo lỗi chứng
          chỉ (PKIX).
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu cấu hình OnePay"}
        </Button>
        <Button type="button" variant="outline" onClick={test} disabled={testing}>
          {testing ? "Đang thử…" : "Test kết nối"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {cfg.baseUrl} · cập nhật {when(cfg.updatedAt)}
        </span>
      </div>
    </div>
  );
}

function InvoicesPanel({ cfg }: { cfg: OnePayConfig | null }) {
  const [rows, setRows] = useState<OnePayInvoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState<OnePayInvoice | null>(null);
  const [sample, setSample] = useState<OnePaySampleIpn | null>(null);

  const load = useCallback(async () => {
    try {
      const { fetchOnePayInvoices } = await api();
      setRows(await fetchOnePayInvoices());
    } catch (e: any) {
      toast.error(e?.message ?? "Không tải được hoá đơn OnePay");
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const replace = (inv: OnePayInvoice) => {
    setRows((prev) => (prev ?? []).map((r) => (r.id === inv.id ? inv : r)));
    setOpen((o) => (o && o.id === inv.id ? inv : o));
  };

  const act = (fn: () => Promise<void>) => {
    setBusy(true);
    void (async () => {
      try {
        await fn();
      } catch (e: any) {
        toast.error(e?.message ?? "Thao tác thất bại");
      } finally {
        setBusy(false);
      }
    })();
  };

  const create = () => {
    const amt = Math.round(Number(amount));
    if (!payerName.trim()) return toast.error("Nhập tên người nộp");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Số tiền phải là số nguyên dương");
    act(async () => {
      const { createOnePayInvoice } = await api();
      const inv = await createOnePayInvoice({
        payerName: payerName.trim(),
        amount: amt,
        description: description.trim() || undefined,
      });
      setRows((prev) => [inv, ...(prev ?? [])]);
      setOpen(inv);
      setPayerName("");
      setAmount("");
      setDescription("");
      toast.success(`Đã tạo hoá đơn · TK ${inv.accountNumber ?? "?"}`);
    });
  };

  const refresh = (inv: OnePayInvoice) =>
    act(async () => {
      const r = await (await api()).refreshOnePayInvoice(inv.id);
      replace(r);
      if (r.lastError) toast.warning(r.lastError);
      else toast.success(`Trạng thái: ${STATE_LABEL[r.state] ?? r.state}`);
    });

  const toggleAccount = (inv: OnePayInvoice) => {
    const active = inv.vaState !== "active";
    if (
      !active &&
      !window.confirm(`Khoá tài khoản ảo ${inv.accountNumber}? Khách không chuyển vào được nữa.`)
    )
      return;
    act(async () => {
      replace(await (await api()).setOnePayAccountState(inv.id, active));
      toast.success(active ? "Đã mở tài khoản ảo" : "Đã khoá tài khoản ảo");
    });
  };

  const remove = (inv: OnePayInvoice) => {
    if (
      !window.confirm(
        `Xoá hoá đơn test ${inv.invoiceReference} khỏi CPN? Tài khoản ảo bên OnePay vẫn còn — nên khoá trước.`,
      )
    )
      return;
    act(async () => {
      setRows(await (await api()).deleteOnePayInvoice(inv.id));
      if (open?.id === inv.id) setOpen(null);
      toast.success("Đã xoá");
    });
  };

  const makeSample = (inv: OnePayInvoice) =>
    act(async () => {
      setSample(
        await (await api()).buildOnePaySampleIpn({ invoiceId: inv.id, apiBase: apiOrigin() }),
      );
    });

  const curl = sample
    ? [
        `curl -X ${sample.method} '${sample.url}'`,
        ...Object.entries(sample.headers).map(([k, v]) => `  -H '${k}: ${v}'`),
        `  -d '${sample.body}'`,
      ].join(" \\\n")
    : "";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Mỗi hoá đơn CPN tạo một tài khoản ảo riêng trên OnePay, kèm QR đã có sẵn số tiền. Sandbox:
        quét QR / chuyển khoản bằng app giả lập OnePay, rồi chờ IPN hoặc bấm "Kiểm tra".
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_160px_1fr_auto]">
        <Input
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          placeholder="Tên người nộp (không dấu)"
        />
        <Input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Số tiền"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Nội dung (tuỳ chọn)"
        />
        <Button type="button" onClick={create} disabled={busy || !cfg?.enabled}>
          Tạo hoá đơn
        </Button>
      </div>
      {cfg && !cfg.enabled ? (
        <p className="text-xs text-muted-foreground">
          Bật thu hộ OnePay ở tab Kết nối để tạo hoá đơn.
        </p>
      ) : null}

      {open ? <InvoiceCard inv={open} onClose={() => setOpen(null)} /> : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Mã / TK ảo</th>
              <th className="px-3 py-2 text-left font-medium">Người nộp</th>
              <th className="px-3 py-2 text-right font-medium">Số tiền</th>
              <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows == null ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  Đang tải…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  Chưa có hoá đơn OnePay
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t align-middle">
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.invoiceReference}
                    <div className="text-muted-foreground">
                      {r.accountNumber ?? "—"} · {r.bankName ?? ""}{" "}
                      {r.vaState === "inactive" ? "· đã khoá" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.payerName}
                    {r.description ? (
                      <div className="text-xs text-muted-foreground">{r.description}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {money(r.amount)}
                    {r.paidAmount != null && Number(r.paidAmount) !== Number(r.amount) ? (
                      <div className="text-xs text-destructive">về {money(r.paidAmount)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <StateBadge state={r.state} />
                    {r.paidTransId ? (
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {r.paidTransId} · {when(r.paidAt)}
                      </div>
                    ) : r.state === "UNPAID" ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        hạn {when(r.expiresAt)}
                      </div>
                    ) : null}
                    {r.lastError ? (
                      <div className="mt-0.5 text-xs text-destructive">{r.lastError}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(r)}>
                        QR
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => refresh(r)}
                      >
                        Kiểm tra
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => toggleAccount(r)}
                      >
                        {r.vaState === "active" ? "Khoá TK" : "Mở TK"}
                      </Button>
                      {cfg?.environment === "SANDBOX" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => makeSample(r)}
                        >
                          IPN mẫu
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => remove(r)}
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

      {sample ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">IPN mẫu đã ký (giả lập OnePay báo có tiền)</span>
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
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono">
            {curl}
          </pre>
          <p className="text-muted-foreground">
            Chỉ có ở Sandbox. Chạy curl này sẽ ghi nhận thanh toán cho hoá đơn test — dùng khi
            OnePay chưa cấu hình URL IPN. Chữ ký gắn với URL, nên phải gọi đúng URL ở trên.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function StateBadge({ state }: { state: OnePayInvoiceState }) {
  const variant =
    state === "PAID" ? "default" : state === "AMOUNT_MISMATCH" ? "destructive" : "outline";
  return <Badge variant={variant}>{STATE_LABEL[state] ?? state}</Badge>;
}

function InvoiceCard({ inv, onClose }: { inv: OnePayInvoice; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setImg(null);
    if (inv.qrData) {
      QRCode.toDataURL(inv.qrData, { margin: 1, width: 280, errorCorrectionLevel: "M" })
        .then((u) => alive && setImg(u))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [inv.qrData]);

  return (
    <div className="flex flex-wrap gap-4 rounded-md border p-3">
      <div className="flex h-[200px] w-[200px] items-center justify-center rounded bg-white">
        {img ? (
          <img src={img} alt="QR chuyển khoản" className="h-full w-full" />
        ) : (
          <span className="text-xs text-muted-foreground">
            {inv.qrData ? "Đang vẽ QR…" : "OnePay chưa trả QR"}
          </span>
        )}
      </div>
      <div className="min-w-[240px] flex-1 space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">Hoá đơn {inv.invoiceReference}</span>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
        <Row label="Ngân hàng" value={inv.bankName ?? "—"} />
        <Row label="Số tài khoản ảo" value={inv.accountNumber ?? "—"} mono copyable />
        <Row label="Chủ tài khoản" value={inv.payerName} />
        <Row label="Số tiền" value={money(inv.amount)} />
        <Row label="Trạng thái" value={STATE_LABEL[inv.state] ?? inv.state} />
        <Row label="Hạn" value={when(inv.expiresAt)} />
        <p className="pt-1 text-xs text-muted-foreground">
          Quét QR hoặc chuyển khoản đúng số tài khoản ảo — CPN khớp theo tài khoản, không theo nội
          dung chuyển khoản.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "select-all font-mono" : ""}>{value}</span>
      {copyable && value !== "—" ? (
        <Button type="button" size="sm" variant="ghost" className="h-6" onClick={() => copy(value)}>
          Copy
        </Button>
      ) : null}
    </div>
  );
}

function LogsPanel() {
  const [logs, setLogs] = useState<OnePayCallLog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void (async () => {
      try {
        const { fetchOnePayLogs } = await api();
        setLogs(await fetchOnePayLogs(200));
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
        <span className="text-xs text-muted-foreground">
          200 lệnh gần nhất: CPN gọi OnePay (OUT) và IPN OnePay gọi về (IN)
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Thời gian</th>
              <th className="px-3 py-2 text-left font-medium">Chiều</th>
              <th className="px-3 py-2 text-left font-medium">Lệnh</th>
              <th className="px-3 py-2 text-left font-medium">Mã tham chiếu / GD</th>
              <th className="px-3 py-2 text-right font-medium">Số tiền</th>
              <th className="px-3 py-2 text-left font-medium">Kết quả</th>
              <th className="px-3 py-2 text-right font-medium">ms</th>
            </tr>
          </thead>
          <tbody>
            {!logs || logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  {logs ? "Chưa có lệnh nào" : "Đang tải…"}
                </td>
              </tr>
            ) : (
              logs.flatMap((l) => {
                const rows = [
                  <tr
                    key={l.id}
                    className="cursor-pointer border-t align-top hover:bg-muted/30"
                    onClick={() => setOpen(open === l.id ? null : l.id)}
                  >
                    <td className="whitespace-nowrap px-3 py-2">{when(l.calledAt)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{l.direction}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.action}
                      {l.httpStatus != null ? (
                        <div className="text-muted-foreground">HTTP {l.httpStatus}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.reference ?? "—"}
                      {l.transId ? <div className="text-muted-foreground">{l.transId}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{money(l.amount)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={GOOD_RESULTS.has(l.result) ? "default" : "destructive"}>
                        {RESULT_LABEL[l.result] ?? l.result}
                      </Badge>
                      {l.message ? <div className="mt-0.5 text-xs">{l.message}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{l.durationMs ?? "—"}</td>
                  </tr>,
                ];
                if (open === l.id) {
                  rows.push(
                    <tr key={`${l.id}-body`} className="bg-muted/20">
                      <td colSpan={7} className="px-3 py-2">
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
