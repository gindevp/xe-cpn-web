import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ROLE_LABELS, type Role } from "@/lib/mock-data";
import { useStore, type UserRec } from "@/lib/store";
import { isApiEnabled } from "@/lib/api/client";
import { listPermissionGroups, type PermissionGroup } from "@/lib/api/permission-api";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/tai-khoan")({
  head: () => ({ meta: [{ title: "Tài khoản — X.E" }] }),
  component: () => (
    <ProtectedPage title="Quản lý tài khoản" screen="tai-khoan">
      <Page />
    </ProtectedPage>
  ),
});

const ALL_ROLES: Role[] = ["AD", "DH", "TCN", "KT", "Q", "BX", "G", "BL"];

function Page() {
  const users = useStore((s) => s.users);
  const offices = useStore((s) => s.offices);
  const upsertUser = useStore((s) => s.upsertUser);
  const [editing, setEditing] = useState<UserRec | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);

  useEffect(() => {
    if (!isApiEnabled()) return;
    listPermissionGroups()
      .then(setGroups)
      .catch(() => undefined);
  }, []);

  return (
    <Section title={`Người dùng (${users.length})`} right={
      <Button onClick={() => { setIsNew(true); setEditing({ username: "", role: "Q", office: offices[0]?.code ?? "", active: true }); }}>Tạo</Button>
    }>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-4">Tài khoản</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Nhóm quyền</th>
              <th className="py-2 pr-4">VP</th>
              <th className="py-2 pr-4">Trạng thái</th>
              <th className="py-2 pr-4">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.username} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{u.username}</td>
                <td className="py-2 pr-4">{ROLE_LABELS[u.role]}</td>
                <td className="py-2 pr-4">
                  {groups.find((g) => g.code === (u.roleGroup ?? u.role))?.name ?? (u.roleGroup ?? "—")}
                </td>
                <td className="py-2 pr-4">{u.office === "ALL" ? "Toàn hệ thống" : offices.find((o) => o.code === u.office)?.name ?? u.office}</td>
                <td className="py-2 pr-4">
                  <Badge variant="outline" className={u.active ? "border-success/40 bg-success/15 text-success" : "border-muted text-muted-foreground"}>
                    {u.active ? "Hoạt động" : "Khóa"}
                  </Badge>
                </td>
                <td className="py-2 pr-4">
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setIsNew(false); setEditing(u); }}>Sửa</Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      upsertUser({ ...u, active: !u.active });
                      toast.success(u.active ? "Đã khóa" : "Đã mở khóa");
                    }}>{u.active ? "Khóa" : "Mở"}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <UserDialog
          user={editing}
          isNew={isNew}
          offices={offices}
          groups={groups}
          existing={users}
          onClose={() => setEditing(null)}
          onSave={(u) => {
            const r = upsertUser(u);
            if (!r.ok) return toast.error(r.error);
            toast.success(isNew ? "Đã tạo user" : "Đã lưu");
            setEditing(null);
          }}
        />
      )}
    </Section>
  );
}

function UserDialog({ user, isNew, offices, groups, existing, onClose, onSave }: {
  user: UserRec; isNew: boolean; offices: { code: string; name: string }[]; groups: PermissionGroup[];
  existing: UserRec[];
  onClose: () => void; onSave: (u: UserRec) => void;
}) {
  const [f, setF] = useState(user);
  const [password, setPassword] = useState("");

  const submit = () => {
    if (!f.username) return toast.error("Nhập tài khoản");
    if (isNew && !password) return toast.error("Nhập mật khẩu");
    if (isNew && existing.some((x) => x.username === f.username)) return toast.error("Trùng username");
    const out = { ...f, passwordHash: password ? btoa(password) : f.passwordHash };
    onSave(out);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isNew ? "Tạo tài khoản" : "Sửa tài khoản"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Tài khoản *"><Input value={f.username} disabled={!isNew} onChange={(e) => setF({ ...f, username: e.target.value })} /></F>
          <F label={isNew ? "Mật khẩu *" : "Đổi mật khẩu (bỏ trống để giữ)"}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </F>
          <F label="Nhóm quyền (chức danh)">
            <SearchableSelect
              value={f.roleGroup ?? f.role}
              onValueChange={(v) => {
                const g = groups.find((x) => x.code === v);
                // Chức danh gốc của nhóm quyết định role nghiệp vụ (phạm vi VP, chốt ngày…).
                setF({ ...f, roleGroup: v, role: (g?.baseRoleCode as Role) ?? (v as Role) ?? f.role });
              }}
              options={
                groups.length
                  ? groups.map((g) => ({ value: g.code, label: `${g.name} (${g.code})`, keywords: g.code }))
                  : ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))
              }
            />
          </F>
          <F label="VP">
            <SearchableSelect
              value={f.office}
              onValueChange={(v) => setF({ ...f, office: v })}
              options={[
                { value: "ALL", label: "Toàn hệ thống" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </F>
          <F label="Trạng thái">
            <SearchableSelect
              value={f.active ? "1" : "0"}
              onValueChange={(v) => setF({ ...f, active: v === "1" })}
              options={[
                { value: "1", label: "Hoạt động" },
                { value: "0", label: "Khóa" },
              ]}
            />
          </F>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={submit}>{isNew ? "Tạo" : "Lưu"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
