import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, LogOut, MonitorSmartphone, RefreshCw, Search, ShieldOff, X } from "lucide-react";
import {
  decideLoginTrust,
  listLoginTrusts,
  listUserSessions,
  revokeUserSession,
  type LoginTrustRow,
  type UserSessionRow,
} from "@/lib/api/login-control-api";

export const Route = createFileRoute("/phien-dang-nhap")({
  head: () => ({ meta: [{ title: "Phiên đăng nhập & thiết bị — X.E" }] }),
  component: () => (
    <ProtectedPage title="Phiên đăng nhập & thiết bị" screen="phien-dang-nhap">
      <Page />
    </ProtectedPage>
  ),
});

type Tab = "PENDING" | "TRUSTED" | "SESSIONS";

const TABS: { key: Tab; label: string; hint: string }[] = [
  {
    key: "PENDING",
    label: "Chờ duyệt",
    hint: "Điều phối / Kế toán đăng nhập web từ IP lạ, hoặc tài khoản đăng nhập app trên thiết bị lạ. Duyệt xong người dùng đăng nhập lại là vào được.",
  },
  {
    key: "TRUSTED",
    label: "IP / thiết bị đã duyệt",
    hint: "Thu hồi: máy đó bị đăng xuất ngay và lần sau phải xin duyệt lại.",
  },
  {
    key: "SESSIONS",
    label: "Phiên đang đăng nhập",
    hint: "Mỗi tài khoản tối đa 1 phiên web + 1 phiên app; đăng nhập nơi mới thì phiên cũ tự bị đăng xuất.",
  },
];

const ROLE_LABEL: Record<string, string> = {
  DH: "Điều phối",
  KT: "Kế toán",
  AD: "Admin",
  Q: "Quầy",
  TCN: "Trưởng CN",
  BX: "Bốc xếp",
  G: "Giao hàng",
  BL: "Ban lãnh đạo",
  KH: "Khách hàng",
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function who(r: { userLogin: string; displayName?: string | null; roleCode?: string | null }) {
  return (
    <>
      <div className="font-medium">{r.displayName || r.userLogin}</div>
      <div className="text-xs text-muted-foreground">
        {r.userLogin}
        {r.roleCode ? ` · ${ROLE_LABEL[r.roleCode] ?? r.roleCode}` : ""}
      </div>
    </>
  );
}

function shortAgent(ua?: string | null) {
  if (!ua) return "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : "";
  return [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 60);
}

function Page() {
  const [tab, setTab] = useState<Tab>("PENDING");
  const [trusts, setTrusts] = useState<LoginTrustRow[]>([]);
  const [sessions, setSessions] = useState<UserSessionRow[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([listLoginTrusts(), listUserSessions()]);
      setTrusts(t ?? []);
      setSessions(s ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(id);
  }, [load]);

  const kw = q.trim().toLowerCase();
  const match = (r: { userLogin: string; displayName?: string | null }, extra: string) =>
    !kw || `${r.userLogin} ${r.displayName ?? ""} ${extra}`.toLowerCase().includes(kw);

  const pending = useMemo(
    () => trusts.filter((t) => t.status === "PENDING" && match(t, `${t.value} ${t.label ?? ""}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trusts, kw],
  );
  const trusted = useMemo(
    () =>
      trusts.filter(
        (t) =>
          (t.status === "APPROVED" || t.status === "REJECTED") && match(t, `${t.value} ${t.label ?? ""}`),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trusts, kw],
  );
  const activeSessions = useMemo(
    () => sessions.filter((s) => match(s, `${s.ip ?? ""} ${s.deviceName ?? ""}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, kw],
  );
  const pendingPage = usePagedRows(pending, "phien-dang-nhap.pending");
  const trustedPage = usePagedRows(trusted, "phien-dang-nhap.trusted");
  const sessionsPage = usePagedRows(activeSessions, "phien-dang-nhap.sessions");

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thực hiện được");
    } finally {
      setBusy(false);
    }
  };

  const counts: Record<Tab, number> = {
    PENDING: trusts.filter((t) => t.status === "PENDING").length,
    TRUSTED: trusts.filter((t) => t.status === "APPROVED" || t.status === "REJECTED").length,
    SESSIONS: sessions.length,
  };
  const activeTab = TABS.find((t) => t.key === tab)!;

  const trustTarget = (t: LoginTrustRow) =>
    t.kind === "IP" ? (
      <>
        <div className="font-medium tabular-nums">IP {t.value}</div>
        <div className="text-xs text-muted-foreground">Web · {shortAgent(t.label)}</div>
      </>
    ) : (
      <>
        <div className="font-medium">{t.label || "Thiết bị không tên"}</div>
        <div className="text-xs text-muted-foreground">
          App · mã {t.value.slice(0, 8)}…{t.lastIp ? ` · IP ${t.lastIp}` : ""}
        </div>
      </>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? "default" : "outline"}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({counts[t.key]})
          </Button>
        ))}
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tài khoản / IP / thiết bị"
          />
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Tải lại
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{activeTab.hint}</p>

      {tab === "PENDING" ? (
        <Section title={`Yêu cầu chờ duyệt (${pending.length})`}>
          {pending.length === 0 ? (
            <EmptyState>Không có yêu cầu chờ duyệt</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">Tài khoản</th>
                    <th className="px-2 py-2">IP / thiết bị</th>
                    <th className="px-2 py-2">Yêu cầu lúc</th>
                    <th className="px-2 py-2 text-right">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPage.pageRows.map((t) => (
                    <tr key={t.id} className="border-b align-top hover:bg-muted/40">
                      <td className="px-2 py-2">{who(t)}</td>
                      <td className="px-2 py-2">{trustTarget(t)}</td>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{fmt(t.requestedAt)}</td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={busy}
                            onClick={() =>
                              void act(() => decideLoginTrust(t.id, "approve"), `Đã duyệt cho ${t.userLogin}`)
                            }
                          >
                            <Check className="h-4 w-4" />
                            Duyệt
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() =>
                              void act(() => decideLoginTrust(t.id, "reject"), `Đã từ chối ${t.userLogin}`)
                            }
                          >
                            <X className="h-4 w-4" />
                            Từ chối
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination pager={pendingPage.pager} />
            </div>
          )}
        </Section>
      ) : null}

      {tab === "TRUSTED" ? (
        <Section title={`IP / thiết bị đã xử lý (${trusted.length})`}>
          {trusted.length === 0 ? (
            <EmptyState>Chưa có IP / thiết bị nào được duyệt</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">Tài khoản</th>
                    <th className="px-2 py-2">IP / thiết bị</th>
                    <th className="px-2 py-2">Trạng thái</th>
                    <th className="px-2 py-2">Dùng gần nhất</th>
                    <th className="px-2 py-2 text-right">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {trustedPage.pageRows.map((t) => (
                    <tr key={t.id} className="border-b align-top hover:bg-muted/40">
                      <td className="px-2 py-2">{who(t)}</td>
                      <td className="px-2 py-2">{trustTarget(t)}</td>
                      <td className="px-2 py-2">
                        <span
                          className={
                            t.status === "APPROVED" ? "font-medium text-emerald-600" : "font-medium text-destructive"
                          }
                        >
                          {t.status === "APPROVED" ? "Đã duyệt" : "Từ chối"}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {t.decidedBy ?? ""} · {fmt(t.decidedAt)}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{fmt(t.lastSeenAt)}</td>
                      <td className="px-2 py-2 text-right">
                        {t.status === "APPROVED" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() => {
                              if (!confirm(`Thu hồi ${t.kind === "IP" ? "IP " + t.value : "thiết bị"} của ${t.userLogin}? Máy đó sẽ bị đăng xuất.`))
                                return;
                              void act(() => decideLoginTrust(t.id, "revoke"), "Đã thu hồi");
                            }}
                          >
                            <ShieldOff className="h-4 w-4" />
                            Thu hồi
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={busy}
                            onClick={() => void act(() => decideLoginTrust(t.id, "approve"), "Đã duyệt lại")}
                          >
                            <Check className="h-4 w-4" />
                            Duyệt lại
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination pager={trustedPage.pager} />
            </div>
          )}
        </Section>
      ) : null}

      {tab === "SESSIONS" ? (
        <Section title={`Phiên đang đăng nhập (${activeSessions.length})`}>
          {activeSessions.length === 0 ? (
            <EmptyState>Không có phiên nào</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2">Tài khoản</th>
                    <th className="px-2 py-2">Kênh</th>
                    <th className="px-2 py-2">IP / thiết bị</th>
                    <th className="px-2 py-2">Đăng nhập lúc</th>
                    <th className="px-2 py-2">Hoạt động gần nhất</th>
                    <th className="px-2 py-2 text-right">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsPage.pageRows.map((s) => (
                    <tr key={s.id} className="border-b align-top hover:bg-muted/40">
                      <td className="px-2 py-2">{who(s)}</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1">
                          <MonitorSmartphone className="h-3.5 w-3.5" />
                          {s.channel === "APP" ? "App" : "Web"}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="tabular-nums">{s.ip ? `IP ${s.ip}` : "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.channel === "APP" ? s.deviceName || "Thiết bị không tên" : shortAgent(s.userAgent)}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{fmt(s.createdAt)}</td>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{fmt(s.lastSeenAt)}</td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          disabled={busy}
                          onClick={() => {
                            if (!confirm(`Đăng xuất ${s.userLogin} khỏi ${s.channel === "APP" ? "app" : "web"}?`)) return;
                            void act(() => revokeUserSession(s.id), `Đã đăng xuất ${s.userLogin}`);
                          }}
                        >
                          <LogOut className="h-4 w-4" />
                          Đăng xuất
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination pager={sessionsPage.pager} />
            </div>
          )}
        </Section>
      ) : null}
    </div>
  );
}
