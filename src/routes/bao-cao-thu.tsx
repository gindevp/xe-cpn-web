import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatVND, ORDER_STATUS_LABEL } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { downloadCSV } from "@/lib/csv";
import { useAuth } from "@/lib/auth";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/bao-cao-thu")({
  head: () => ({ meta: [{ title: "Báo cáo thu — X.E" }] }),
  component: () => (
    <ProtectedPage title="Báo cáo thu ngày" screen="bao-cao-thu">
      <Page />
    </ProtectedPage>
  ),
});

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const dayClosures = useStore((s) => s.dayClosures);
  const { closeDay, reopenDay } = useStore.getState();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [office, setOffice] = useState(session?.office && session.office !== "ALL" ? session.office : offices[0]?.code ?? "GP");

  const stat = useMemo(() => {
    const start = new Date(date + "T00:00:00").getTime();
    const end = start + 86400000;
    const byUser = new Map<string, { tm: number; ck: number; the: number }>();
    const byForm = new Map<string, number>();
    const byPay = { TM: 0, CK: 0, THE: 0 };
    let total = 0;
    orders.forEach((o) => {
      if (o.fromOffice !== office && o.toOffice !== office) return;
      (o.payments ?? []).forEach((p) => {
        const t = new Date(p.at).getTime();
        if (t < start || t >= end) return;
        const u = byUser.get(p.by) ?? { tm: 0, ck: 0, the: 0 };
        if (p.method === "TM") u.tm += p.amount;
        if (p.method === "CK") u.ck += p.amount;
        if (p.method === "THE") u.the += p.amount;
        byUser.set(p.by, u);
        byPay[p.method] += p.amount;
        const f = o.collectForm;
        byForm.set(f, (byForm.get(f) ?? 0) + p.amount);
        total += p.amount;
      });
    });
    const leak = orders.filter((o) => {
      if (o.fromOffice !== office && o.toOffice !== office) return false;
      const paid = o.paidAmount ?? 0;
      const due = o.fare + (o.deliveryFee ?? 0);
      if (paid >= due) return false;
      if (o.collectForm === "NHAN_TRA") return true;
      return ["DELIVERED", "OUT_FOR_DELIVERY"].includes(o.status);
    });
    return { total, byUser: Array.from(byUser.entries()), byForm: Array.from(byForm.entries()), byPay, leak };
  }, [orders, office, date]);

  const closure = dayClosures.find((c) => c.office === office && c.date === date);
  const isReopened = !!closure?.reopenedAt;
  const isClosed = closure && !isReopened;
  const canClose = session?.role === "KT";
  const canReopen = () => {
    if (!closure) return false;
    const age = Date.now() - new Date(closure.confirmedAt).getTime();
    if (age <= 48 * 3600 * 1000) return session?.role === "TCN" || session?.role === "AD" || session?.role === "DH";
    return session?.role === "DH" || session?.role === "AD";
  };

  const doExport = () => {
    downloadCSV(`bao-cao-thu-${office}-${date}.csv`, [
      ["Người thu", "TM", "CK", "THẺ", "Tổng"],
      ...stat.byUser.map(([u, v]) => [u, v.tm, v.ck, v.the, v.tm + v.ck + v.the]),
      [],
      ["Hình thức", "Tổng"],
      ...stat.byForm.map(([f, v]) => [f, v]),
      [],
      ["Phương thức", "Tổng"],
      ["TM", stat.byPay.TM], ["CK", stat.byPay.CK], ["THẺ", stat.byPay.THE],
    ]);
  };

  return (
    <div className="space-y-4">
      <Section title="Bộ lọc" right={<Button variant="outline" onClick={doExport}>Xuất CSV</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Ngày</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">VP</Label>
            <Select value={office} onValueChange={setOffice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{offices.map((o) => (<SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        </div>
        {isClosed && (
          <div className="mt-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            Ngày đã đối soát bởi {closure.confirmedBy} lúc {new Date(closure.confirmedAt).toLocaleString("vi-VN")}
          </div>
        )}
        {isReopened && (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            Đã mở lại bởi {closure.reopenedBy} lúc {new Date(closure.reopenedAt!).toLocaleString("vi-VN")}
          </div>
        )}
      </Section>

      <div className="rounded-md border bg-primary/5 p-4">
        <div className="text-xs uppercase text-muted-foreground">Tổng thu ngày</div>
        <div className="text-3xl font-bold text-primary">{formatVND(stat.total)}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Theo người thu">
          {stat.byUser.length === 0 ? <EmptyState /> : (
            <table className="w-full text-sm">
              <tbody>
                {stat.byUser.map(([u, v]) => (
                  <tr key={u} className="border-b last:border-0">
                    <td className="py-1.5">{u}</td>
                    <td className="py-1.5 text-right font-medium">{formatVND(v.tm + v.ck + v.the)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Theo hình thức">
          {stat.byForm.length === 0 ? <EmptyState /> : (
            <table className="w-full text-sm">
              <tbody>
                {stat.byForm.map(([f, v]) => (
                  <tr key={f} className="border-b last:border-0">
                    <td className="py-1.5">{f}</td>
                    <td className="py-1.5 text-right font-medium">{formatVND(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Theo phương thức">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="py-1.5">TM</td><td className="py-1.5 text-right font-medium">{formatVND(stat.byPay.TM)}</td></tr>
              <tr className="border-b"><td className="py-1.5">CK</td><td className="py-1.5 text-right font-medium">{formatVND(stat.byPay.CK)}</td></tr>
              <tr><td className="py-1.5">THẺ</td><td className="py-1.5 text-right font-medium">{formatVND(stat.byPay.THE)}</td></tr>
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Chống rò tiền" className="border-destructive/40">
        {stat.leak.length === 0 ? <EmptyState>Không có đơn nghi rò</EmptyState> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5">Mã</th>
                <th className="py-1.5 text-right">Còn phải thu</th>
                <th className="py-1.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {stat.leak.map((r) => (
                <tr key={r.code} className="border-b last:border-0 bg-destructive/5">
                  <td className="py-1.5 font-medium">{r.code}</td>
                  <td className="py-1.5 text-right font-semibold text-destructive">{formatVND(r.fare + (r.deliveryFee ?? 0) - (r.paidAmount ?? 0))}</td>
                  <td className="py-1.5">{ORDER_STATUS_LABEL[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!canClose || isClosed} onClick={() => {
          closeDay(office, date, session!.username);
          toast.success("Đã xác nhận đối soát");
        }}>Xác nhận đối soát (KT)</Button>
        <Button variant="outline" disabled={!canReopen() || !isClosed} onClick={() => {
          reopenDay(office, date, session!.username);
          toast.success("Đã mở lại ngày");
        }}>Mở lại ngày</Button>
      </div>
    </div>
  );
}
