import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecretInput } from "@/components/SecretInput";
import { Section } from "@/components/PageBits";
import { apiRequest } from "@/lib/api/client";

type Slot = {
  slot: "A" | "B";
  label: string;
  jdbcUrl: string;
  username: string;
  passwordConfigured: boolean;
  usesEnvironment: boolean;
  active: boolean;
  lastTestOk: boolean | null;
  lastSyncAt?: string | null;
};

type Board = {
  runtimeUrl?: string;
  cuttingOver?: boolean;
  switchStatus?: string;
  switchMessage?: string;
  slots: Slot[];
};

const EMPTY: Slot[] = [
  { slot: "A", label: "Database 1", jdbcUrl: "", username: "", passwordConfigured: false, usesEnvironment: true, active: true, lastTestOk: null },
  { slot: "B", label: "Database 2", jdbcUrl: "", username: "", passwordConfigured: false, usesEnvironment: true, active: false, lastTestOk: null },
];

export function DatabaseSlotsPanel() {
  const [slots, setSlots] = useState<Slot[]>(EMPTY);
  const [passwords, setPasswords] = useState<Record<string, string>>({ A: "", B: "" });
  const [runtimeUrl, setRuntimeUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [switchMessage, setSwitchMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    const board = await apiRequest<Board>("/api/integration-config/databases");
    setLoadError("");
    setRuntimeUrl(board.runtimeUrl ?? "");
    setSlots(board.slots?.length ? board.slots : EMPTY);
    setSwitchMessage(board.switchMessage ?? "");
    return board;
  }, []);

  useEffect(() => {
    void load().catch((e: Error) => setLoadError(e.message || "Không tải được cấu hình database"));
  }, [load]);

  const patch = (slot: string, field: keyof Slot, value: string) => {
    setSlots((rows) => rows.map((row) => (row.slot === slot ? { ...row, [field]: value } : row)));
  };

  const save = async (row: Slot) => {
    setBusy("save-" + row.slot);
    try {
      const board = await apiRequest<Board>(`/api/integration-config/databases/${row.slot}`, {
        method: "PUT",
        body: {
          label: row.label,
          jdbcUrl: row.jdbcUrl,
          username: row.username,
          ...(passwords[row.slot] ? { password: passwords[row.slot] } : {}),
        },
      });
      setSlots(board.slots);
      setPasswords((p) => ({ ...p, [row.slot]: "" }));
      toast.success("Đã lưu " + row.label);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(null);
    }
  };

  const test = async (row: Slot) => {
    setBusy("test-" + row.slot);
    try {
      if (row.jdbcUrl || row.username || passwords[row.slot]) await save(row);
      const r = await apiRequest<{ message?: string }>(`/api/integration-config/databases/${row.slot}/test`, { method: "POST" });
      toast.success(r.message || "Kết nối thành công");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không kết nối được");
      await load().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const waitSwitch = async () => {
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = await apiRequest<{ cuttingOver?: boolean; switchStatus?: string; switchMessage?: string }>(
        "/api/integration-config/databases/switch",
      );
      setSwitchMessage(st.switchMessage ?? "");
      if (!st.cuttingOver) {
        if (st.switchStatus === "FAILED") toast.error(st.switchMessage || "Chuyển database thất bại");
        else toast.success(st.switchMessage || "Đã chuyển database");
        await load();
        return;
      }
    }
    toast.error("Đồng bộ quá lâu — xem log API");
  };

  const swap = async (target: Slot) => {
    setBusy("switch");
    setSwitchMessage("Đang đồng bộ dữ liệu, chưa chuyển…");
    try {
      await apiRequest("/api/integration-config/databases/switch", { method: "POST", body: { target: target.slot } });
      await waitSwitch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không chuyển được");
      setSwitchMessage("");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Hai database">
      <p className="mb-3 text-xs text-muted-foreground">
        API vẫn dùng database Railway. Database kia chỉ để lưu địa chỉ và thử kết nối. Cổng chưa mở thì Test báo lỗi, không đụng dữ liệu đang chạy.
        {runtimeUrl ? ` Đang chạy: ${runtimeUrl}` : ""}
      </p>
      {loadError ? <p className="mb-3 text-sm text-amber-800">{loadError}</p> : null}
      {switchMessage ? <p className="mb-3 text-sm font-medium">{switchMessage}</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {slots.map((row) => (
          <div key={row.slot} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Input value={row.label ?? ""} onChange={(e) => patch(row.slot, "label", e.target.value)} className="h-8 font-medium" />
              {row.active ? <span className="shrink-0 text-xs font-semibold text-emerald-700">Đang dùng</span> : null}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">JDBC {row.usesEnvironment ? "· trống = môi trường hiện tại" : ""}</Label>
              <Input
                value={row.jdbcUrl ?? ""}
                placeholder={row.slot === "B" ? "jdbc:mysql://113.20.107.44:3308/cpn?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true" : "jdbc:mysql://host:3306/cpn?..."}
                onChange={(e) => patch(row.slot, "jdbcUrl", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">User</Label>
                <Input value={row.username ?? ""} onChange={(e) => patch(row.slot, "username", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mật khẩu {row.passwordConfigured ? "· đã lưu" : ""}</Label>
                <SecretInput
                  value={passwords[row.slot] ?? ""}
                  placeholder={row.passwordConfigured ? "Nhập để thay" : "Mật khẩu"}
                  onChange={(e) => setPasswords((p) => ({ ...p, [row.slot]: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => void save(row)}>
                Lưu
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={!!busy} onClick={() => void test(row)}>
                {busy === "test-" + row.slot ? "Đang thử…" : "Test kết nối"}
              </Button>
              {!row.active ? (
                <Button type="button" size="sm" disabled={!!busy || row.lastTestOk !== true} onClick={() => void swap(row)}>
                  {busy === "switch" ? "Đang đồng bộ…" : "Chuyển sang đây"}
                </Button>
              ) : null}
            </div>
            {row.lastTestOk === false ? <p className="text-xs text-amber-800">Lần test gần nhất thất bại.</p> : null}
          </div>
        ))}
      </div>
    </Section>
  );
}
