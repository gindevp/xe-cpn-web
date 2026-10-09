import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  emptyMaintenancePolicy,
  fetchDepositAccount,
  putDepositAccount,
  type DepositAccount,
  fetchInvoiceAutoIssue,
  fetchMaintenancePolicy,
  putInvoiceAutoIssue,
  type InvoiceAutoIssuePolicy,
  fetchMobileAppVersion,
  fetchSessionPolicy,
  fetchTrackLookupPolicy,
  fetchOfficeScreens,
  rotateOfficeScreen,
  putTrackLookupPolicy,
  putMaintenancePolicy,
  putMobileAppVersion,
  putSessionPolicy,
  type MaintenancePolicy,
  type MobileAppVersionPolicy,
  type SessionPolicy,
  type TrackLookupPolicy,
  type OfficeScreenLink,
} from "@/lib/api/finance-config-api";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import {
  deleteScanVoice,
  fetchScanVoiceBlob,
  listScanVoices,
  scanVoiceLabel,
  uploadScanVoice,
  type ScanVoiceMeta,
  type ScanVoiceType,
} from "@/lib/api/scan-voice-api";
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
        <TabsTrigger value="tra-cuu">Tra cứu</TabsTrigger>
        <TabsTrigger value="update">Update</TabsTrigger>
        <TabsTrigger value="giong-quet">Giọng quét</TabsTrigger>
        <TabsTrigger value="hoa-don">Hoá đơn</TabsTrigger>
        <TabsTrigger value="nop-tien">Nộp tiền</TabsTrigger>
      </TabsList>
      <TabsContent value="bao-tri" className="mt-4">
        <MaintenanceTab />
      </TabsContent>
      <TabsContent value="phien" className="mt-4">
        <SessionTab />
      </TabsContent>
      <TabsContent value="tra-cuu" className="mt-4">
        <TrackLookupTab />
      </TabsContent>
      <TabsContent value="update" className="mt-4">
        <MobileAppVersionTab />
      </TabsContent>
      <TabsContent value="giong-quet" className="mt-4">
        <ScanVoiceTab />
      </TabsContent>
      <TabsContent value="hoa-don" className="mt-4">
        <InvoiceAutoIssueTab />
      </TabsContent>
      <TabsContent value="nop-tien" className="mt-4">
        <DepositAccountTab />
      </TabsContent>
    </Tabs>
  );
}

type VietQrBank = { bin: string; shortName: string; name: string };

const DEPOSIT_TEMPLATE_VARS = [
  { key: "{MA_NV}", label: "Mã NV" },
  { key: "{TEN_NV}", label: "Tên NV" },
  { key: "{MA_PHIEU}", label: "Mã phiếu" },
  { key: "{MA_VP}", label: "ID văn phòng" },
  { key: "{NGAY}", label: "Ngày thu tiền (ddMMyy)" },
] as const;
const DEFAULT_DEPOSIT_TEMPLATE = "{MA_NV} NOP {MA_PHIEU}";

/** Giống StaffDepositService.renderContent (BE) — chỉ để xem trước. */
function renderDepositContent(template: string, vars: Record<string, string>) {
  let s = template.trim() || DEFAULT_DEPOSIT_TEMPLATE;
  for (const [k, v] of Object.entries(vars)) s = s.split(k).join(v);
  const plain = s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 50).trim();
}

/** Tài khoản nhận tiền NV nộp trên app — app tạo QR VietQR theo STK + nội dung chuyển khoản này. */
function DepositAccountTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<DepositAccount | null>(null);
  const [banks, setBanks] = useState<VietQrBank[] | null>(null);
  const [banksFailed, setBanksFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isApiEnabled()) return;
    fetchDepositAccount()
      .then((a) => {
        if (!cancelled) setF({ ...a, contentTemplate: a.contentTemplate || DEFAULT_DEPOSIT_TEMPLATE });
      })
      .catch((e: any) => {
        if (!cancelled) toast.error(e?.message ?? "Không tải được cấu hình nộp tiền");
      });
    fetch("https://api.vietqr.io/v2/banks")
      .then((r) => r.json())
      .then((j: { data?: VietQrBank[] }) => {
        if (cancelled) return;
        const rows = (j.data ?? []).filter((b) => b.bin && b.shortName);
        if (rows.length) setBanks(rows);
        else setBanksFailed(true);
      })
      .catch(() => {
        if (!cancelled) setBanksFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bankOptions = useMemo(
    () =>
      (banks ?? []).map((b) => ({
        value: b.bin,
        label: `${b.shortName} — ${b.name}`,
        keywords: `${b.shortName} ${b.name} ${b.bin}`,
      })),
    [banks],
  );

  const sampleContent = useMemo(() => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yy = String(today.getFullYear()).slice(-2);
    return renderDepositContent(f?.contentTemplate ?? "", {
      "{MA_NV}": session?.username || "anhnh",
      "{TEN_NV}": "Nguyen Hoang Anh",
      "{MA_PHIEU}": `PTVP_ND${yy}${mm}${dd}-001`,
      "{MA_VP}": "12",
      "{NGAY}": `${dd}${mm}${yy}`,
    });
  }, [f?.contentTemplate, session?.username]);

  const previewQr =
    f?.bankBin && f.accountNo
      ? `https://img.vietqr.io/image/${f.bankBin}-${f.accountNo}-qr_only.png?amount=145000&addInfo=${encodeURIComponent(
          sampleContent,
        )}${f.accountName ? `&accountName=${encodeURIComponent(f.accountName)}` : ""}`
      : "";

  const insertVar = (key: string) =>
    setF((prev) => {
      if (!prev) return prev;
      const cur = prev.contentTemplate ?? "";
      return { ...prev, contentTemplate: `${cur}${cur && !cur.endsWith(" ") ? " " : ""}${key}` };
    });

  const save = async () => {
    if (!f) return;
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    if (!f.bankBin || !f.accountNo?.trim() || !f.accountName?.trim()) {
      return toast.error("Nhập đủ ngân hàng, số tài khoản và chủ tài khoản");
    }
    setSaving(true);
    try {
      const saved = await putDepositAccount({
        ...f,
        accountNo: f.accountNo.trim(),
        accountName: f.accountName.trim(),
        contentTemplate: (f.contentTemplate ?? "").trim() || DEFAULT_DEPOSIT_TEMPLATE,
      });
      setF(saved);
      toast.success("Đã lưu tài khoản nhận tiền nộp");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu cấu hình nộp tiền thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Tài khoản nhận tiền nhân viên nộp">
      {!f ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Ngân hàng *</Label>
              {banksFailed ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Mã BIN (6 số, VD 970407)"
                    value={f.bankBin ?? ""}
                    disabled={!writable}
                    onChange={(e) => setF({ ...f, bankBin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                  />
                  <Input
                    placeholder="Tên ngân hàng"
                    value={f.bankName ?? ""}
                    disabled={!writable}
                    onChange={(e) => setF({ ...f, bankName: e.target.value })}
                  />
                </div>
              ) : (
                <SearchableSelect
                  value={f.bankBin ?? ""}
                  onValueChange={(bin) => {
                    const b = banks?.find((x) => x.bin === bin);
                    setF({ ...f, bankBin: bin, bankName: b ? `${b.shortName} (${b.name})` : f.bankName });
                  }}
                  placeholder={banks ? "Chọn ngân hàng" : "Đang tải danh sách ngân hàng…"}
                  disabled={!writable || !banks}
                  options={bankOptions}
                />
              )}
              {banksFailed ? (
                <p className="text-[11px] text-amber-700">
                  Không tải được danh sách ngân hàng VietQR — nhập mã BIN thủ công.
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Số tài khoản *</Label>
                <Input
                  value={f.accountNo ?? ""}
                  disabled={!writable}
                  inputMode="numeric"
                  onChange={(e) => setF({ ...f, accountNo: e.target.value.replace(/[^0-9A-Za-z]/g, "") })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Chủ tài khoản *</Label>
                <Input
                  value={f.accountName ?? ""}
                  disabled={!writable}
                  className="uppercase"
                  onChange={(e) => setF({ ...f, accountName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nội dung chuyển khoản</Label>
              <Input
                value={f.contentTemplate ?? ""}
                disabled={!writable}
                maxLength={255}
                onChange={(e) => setF({ ...f, contentTemplate: e.target.value })}
              />
              <div className="flex flex-wrap gap-1.5">
                {DEPOSIT_TEMPLATE_VARS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    disabled={!writable}
                    onClick={() => insertVar(v.key)}
                    className="rounded-full border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {v.key} · {v.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Ví dụ thực tế: <span className="font-mono font-medium text-foreground">{sampleContent || "—"}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Nội dung tự bỏ dấu, chỉ giữ chữ và số, tối đa 50 ký tự (giới hạn của ngân hàng).
              </p>
            </div>
            <Button onClick={() => void save()} disabled={saving || !writable}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Xem trước QR (145.000đ)</Label>
            <div className="flex aspect-square items-center justify-center rounded-lg border bg-white p-3">
              {previewQr ? (
                <img src={previewQr} alt="QR VietQR xem trước" className="h-full w-full object-contain" />
              ) : (
                <span className="px-4 text-center text-xs text-muted-foreground">
                  Chọn ngân hàng và nhập số tài khoản để xem QR
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Quét thử bằng app ngân hàng để kiểm tra đúng tài khoản trước khi lưu.
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

/** Bật/tắt tự xuất HĐĐT sau 3 tiếng — lưu ngay khi gạt (MISA phát hành thật, không huỷ được). */
function InvoiceAutoIssueTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<InvoiceAutoIssuePolicy | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isApiEnabled()) return;
    fetchInvoiceAutoIssue()
      .then((p) => {
        if (!cancelled) setF(p);
      })
      .catch((e: any) => {
        if (!cancelled) toast.error(e?.message ?? "Không tải được cấu hình hoá đơn");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (enabled: boolean) => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    const msg = enabled
      ? "BẬT tự xuất hoá đơn điện tử THẬT qua MISA?\n\n" +
        "Từ lúc bật, đơn đã giao thành công (hoặc hoàn xong) và quá 3 tiếng kể từ khi thanh toán sẽ tự xuất: HĐ doanh nghiệp nếu khách đã yêu cầu, còn lại HĐ cá nhân.\n" +
        "Đơn thanh toán trước lúc bật KHÔNG tự xuất — dùng nút Xuất bù ở màn Quản lý hoá đơn / Giao thành công."
      : "TẮT tự xuất hoá đơn?\n\nSau khi tắt, chỉ đơn có yêu cầu HĐ công ty tự xuất khi giao thành công (như trước).";
    if (!window.confirm(msg)) return;
    setSaving(true);
    try {
      setF(await putInvoiceAutoIssue(enabled));
      toast.success(enabled ? "Đã bật tự xuất hoá đơn" : "Đã tắt tự xuất hoá đơn");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu cấu hình hoá đơn thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Tự xuất hoá đơn điện tử (MISA)">
      {!f ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch checked={f.enabled} disabled={saving || !writable} onCheckedChange={(v) => void toggle(v)} />
            <Label className="text-sm">Tự xuất hoá đơn sau 3 tiếng kể từ khi thanh toán (đơn đã giao thành công)</Label>
          </div>
          {f.enabled && f.since ? (
            <p className="text-xs text-emerald-700">Đang bật từ {new Date(f.since).toLocaleString("vi-VN")}.</p>
          ) : null}
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Mốc thanh toán: gửi trả = lúc nhập kho gửi; nhận trả / COD = lúc giao thành công.</li>
            <li>
              Chỉ tự xuất khi đơn đã giao thành công (đơn gửi trả bị hoàn: đã hoàn xong về người gửi) và đã quá 3 tiếng
              kể từ mốc thanh toán.
            </li>
            <li>Khách muốn HĐ công ty phải yêu cầu trước lúc đó; quá hạn hệ thống xuất HĐ cá nhân.</li>
            <li>HĐ cá nhân ghi tên + SĐT người trả cước, hình thức thanh toán tiền mặt.</li>
            <li>Không tự xuất: đơn công nợ, đơn còn nợ cước, đơn kế toán đã tích bỏ xuất tự động, đơn lần trước lỗi.</li>
            <li>Đơn thanh toán trước lúc bật không tự xuất bù — dùng nút Xuất bù.</li>
          </ul>
        </div>
      )}
    </Section>
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

const SCAN_VOICE_TYPES: ScanVoiceType[] = ["ok", "err"];
const MAX_SCAN_VOICE_BYTES = 500 * 1024;

/** Giọng người khi quét trên app — upload trên web, app cache theo etag. */
function ScanVoiceTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [voices, setVoices] = useState<ScanVoiceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ScanVoiceType | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const reload = async () => {
    const rows = await listScanVoices();
    setVoices(rows);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        await reload();
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được giọng quét");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const of = (type: ScanVoiceType) => voices.find((v) => v.type === type);

  const onUpload = async (type: ScanVoiceType, file: File | undefined) => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["mp3", "wav", "m4a", "aac", "ogg"].includes(ext)) {
      return toast.error("Chỉ nhận mp3, wav, m4a, aac, ogg");
    }
    if (file.size > MAX_SCAN_VOICE_BYTES) return toast.error("File tối đa 500 KB");
    setBusy(type);
    try {
      await uploadScanVoice(type, file);
      await reload();
      toast.success(`Đã lưu giọng «${scanVoiceLabel(type)}»`);
    } catch (e: any) {
      toast.error(e?.message ?? "Không tải lên được");
    } finally {
      setBusy(null);
    }
  };

  const onListen = async (type: ScanVoiceType) => {
    setBusy(type);
    try {
      const blob = await fetchScanVoiceBlob(type);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      toast.error(e?.message ?? "Không nghe được");
    } finally {
      setBusy(null);
    }
  };

  const onReset = async (type: ScanVoiceType) => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    if (!confirm(`Xóa giọng tùy chỉnh «${scanVoiceLabel(type)}»?\nApp sẽ dùng giọng mặc định.`)) return;
    setBusy(type);
    try {
      await deleteScanVoice(type);
      await reload();
      toast.success("Đã về giọng mặc định");
    } catch (e: any) {
      toast.error(e?.message ?? "Không xóa được");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Giọng quét trên app">
      <p className="mb-3 text-sm text-muted-foreground">
        App mở máy chỉ kiểm tra 1 lần: etag không đổi thì dùng cache; đổi thì tải lại. Không cấu hình = giọng
        mặc định trong app («Được» / «Sai»).
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : (
        <div className="space-y-3">
          {SCAN_VOICE_TYPES.map((type) => {
            const row = of(type);
            const configured = !!row?.configured;
            const working = busy === type;
            return (
              <div
                key={type}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">{scanVoiceLabel(type)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {configured
                      ? `${row?.fileName || type} · ${Math.round((row?.byteSize ?? 0) / 1024)} KB`
                      : "Đang dùng giọng mặc định trên app"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*"
                      className="hidden"
                      disabled={!writable || working}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        void onUpload(type, f);
                      }}
                    />
                    <Button type="button" size="sm" variant="secondary" disabled={!writable || working} asChild>
                      <span>{working ? "Đang xử lý…" : "Tải lên"}</span>
                    </Button>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!configured || working}
                    onClick={() => void onListen(type)}
                  >
                    Nghe
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={!writable || !configured || working}
                    onClick={() => void onReset(type)}
                  >
                    Mặc định
                  </Button>
                </div>
              </div>
            );
          })}
          {previewUrl ? (
            <audio controls autoPlay src={previewUrl} className="w-full" />
          ) : null}
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

function TrackLookupTab() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "bao-tri");
  const [f, setF] = useState<TrackLookupPolicy>({
    enabled: true,
    dailyLimit: 30,
    qrRefreshSeconds: 60,
    qrQuietEnabled: true,
    qrQuietFrom: "21:00",
    qrQuietTo: "07:00",
  });
  const [links, setLinks] = useState<OfficeScreenLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadLinks = async () => {
    const rows = await fetchOfficeScreens();
    setLinks(rows);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isApiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        const [p, rows] = await Promise.all([fetchTrackLookupPolicy(), fetchOfficeScreens()]);
        if (cancelled) return;
        setF(p);
        setLinks(rows);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Không tải được cấu hình tra cứu");
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
    const n = Math.round(Number(f.dailyLimit));
    const refresh = Math.round(Number(f.qrRefreshSeconds));
    if (!Number.isFinite(n) || n < 0 || n > 10000) {
      return toast.error("Số lần mỗi ngày phải từ 0 đến 10000. Nhập 0 nếu không giới hạn.");
    }
    if (!Number.isFinite(refresh) || refresh < 15 || refresh > 36000) {
      return toast.error("Thời gian làm mới QR phải từ 15 đến 36000 giây.");
    }
    if (f.qrQuietEnabled && (!/^\d{2}:\d{2}$/.test(f.qrQuietFrom) || !/^\d{2}:\d{2}$/.test(f.qrQuietTo))) {
      return toast.error("Giờ tắt và giờ bật lại phải dạng HH:mm, ví dụ 21:00");
    }
    if (f.qrQuietEnabled && f.qrQuietFrom === f.qrQuietTo) {
      return toast.error("Giờ tắt QR và giờ bật lại phải khác nhau.");
    }
    setSaving(true);
    try {
      if (!isApiEnabled()) throw new Error("API chưa cấu hình — không lưu được lên máy chủ");
      const saved = await putTrackLookupPolicy({
        enabled: f.enabled,
        dailyLimit: n,
        qrRefreshSeconds: refresh,
        qrQuietEnabled: f.qrQuietEnabled,
        qrQuietFrom: f.qrQuietFrom,
        qrQuietTo: f.qrQuietTo,
      });
      setF(saved);
      toast.success("Đã lưu cấu hình tra cứu");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu cấu hình tra cứu thất bại");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (displayKey: string) => {
    const url = `${window.location.origin}/man-hinh-qr/${displayKey}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Đã chép link màn hình");
    } catch {
      toast.message(url);
    }
  };

  const rotate = async (officeCode: string) => {
    if (!writable) return toast.error("Tài khoản không có quyền ghi màn này");
    try {
      await rotateOfficeScreen(officeCode);
      await loadLinks();
      toast.success("Đã tạo link mới. Link cũ không mở được nữa.");
    } catch (e: any) {
      toast.error(e?.message ?? "Không tạo lại được link");
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Giới hạn tra cứu mỗi thiết bị">
        {loading ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} />
              <Label className="text-sm">Chặn khi tra cứu quá nhiều lần</Label>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Số lần tối đa trong một ngày</Label>
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  className="max-w-[10rem]"
                  value={f.dailyLimit}
                  onChange={(e) => setF({ ...f, dailyLimit: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">QR văn phòng làm mới sau (giây)</Label>
                <Input
                  type="number"
                  min={15}
                  max={36000}
                  className="max-w-[10rem]"
                  value={f.qrRefreshSeconds}
                  onChange={(e) => setF({ ...f, qrRefreshSeconds: Number(e.target.value) })}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Mỗi văn phòng chỉ một máy được chiếu QR. Mã đổi theo số giây ở trên, nên ảnh chụp mang về nhà sẽ hết hạn.
              Nhập 0 lần tra cứu hoặc tắt công tắc nếu không muốn chặn số lần.
            </p>
            <div className="flex items-center gap-2">
              <Switch
                checked={f.qrQuietEnabled}
                onCheckedChange={(v) => setF({ ...f, qrQuietEnabled: v })}
              />
              <Label className="text-sm">Tắt QR ngoài giờ, hết giờ tự phát mã mới</Label>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Tắt từ</Label>
                <Input
                  type="time"
                  className="max-w-[10rem]"
                  value={f.qrQuietFrom}
                  onChange={(e) => setF({ ...f, qrQuietFrom: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bật lại</Label>
                <Input
                  type="time"
                  className="max-w-[10rem]"
                  value={f.qrQuietTo}
                  onChange={(e) => setF({ ...f, qrQuietTo: e.target.value })}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Giờ Việt Nam. Ví dụ 21:00 đến 07:00: mã đang chiếu chết lúc 21:00, sáng hôm sau đúng 07:00 màn hình tự
              hiện mã mới. Ảnh chụp mã cũ không tra được trong khoảng này.
            </p>
            <Button onClick={() => void save()} disabled={saving || !writable || loading}>
              {saving ? "Đang lưu…" : "Lưu cấu hình"}
            </Button>
          </div>
        )}
      </Section>
      <Section title="Link màn hình QR từng văn phòng">
        {loading ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có văn phòng đang hoạt động.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Văn phòng</th>
                  <th className="py-2 pr-3 font-medium">Đang chiếu</th>
                  <th className="py-2 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {links.map((row) => (
                  <tr key={row.officeCode} className="border-t">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{row.officeName}</div>
                      <div className="text-xs text-muted-foreground">{row.officeCode}</div>
                    </td>
                    <td className="py-2 pr-3">{row.showing ? "Có" : "Không"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => void copyLink(row.displayKey)}>
                          Chép link
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void rotate(row.officeCode)}>
                          Tạo link mới
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
