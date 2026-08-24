import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ROLE_LABELS, type Role } from "@/lib/mock-data";
import { isApiEnabled } from "@/lib/api/client";
import {
  createPermissionGroup,
  deletePermissionGroup,
  listPermissionGroups,
  listScreens,
  updatePermissionGroup,
  type PermLevel,
  type PermissionGroup,
  type ScreenMeta,
} from "@/lib/api/permission-api";
import { Lock, Pencil, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/nhom-quyen")({
  head: () => ({ meta: [{ title: "Nhóm quyền — X.E" }] }),
  component: () => (
    <ProtectedPage title="Nhóm quyền theo chức danh" screen="nhom-quyen">
      <Page />
    </ProtectedPage>
  ),
});

const BASE_ROLES: Role[] = ["AD", "DH", "TCN", "KT", "Q", "BX", "G", "BL"];

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

const LEVELS: { value: PermLevel; label: string }[] = [
  { value: "Y", label: "Sửa" },
  { value: "R", label: "Xem" },
  { value: "N", label: "Không" },
];

function Page() {
  const [screens, setScreens] = useState<ScreenMeta[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<PermissionGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PermissionGroup | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isApiEnabled()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [screenRows, groupRows] = await Promise.all([listScreens(), listPermissionGroups()]);
        if (cancelled) return;
        setScreens(screenRows);
        setGroups(groupRows);
        setSelected(groupRows[0]?.code ?? null);
        setDraft(groupRows[0] ? { ...groupRows[0], screens: { ...groupRows[0].screens } } : null);
      } catch (e: unknown) {
        if (!cancelled) toast.error(errMsg(e, "Không tải được nhóm quyền"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const modules = useMemo(() => {
    const map = new Map<string, ScreenMeta[]>();
    for (const s of screens) {
      if (s.hidden && !showHidden) continue;
      const list = map.get(s.module) ?? [];
      list.push(s);
      map.set(s.module, list);
    }
    return [...map.entries()];
  }, [screens, showHidden]);

  const hiddenCount = useMemo(() => screens.filter((s) => s.hidden).length, [screens]);

  const pick = (code: string) => {
    const g = groups.find((x) => x.code === code);
    setSelected(code);
    setDraft(g ? { ...g, screens: { ...g.screens } } : null);
  };

  const applySaved = (saved: PermissionGroup) => {
    setGroups((rows) => rows.map((r) => (r.code === saved.code ? saved : r)));
    if (selected === saved.code) setDraft({ ...saved, screens: { ...saved.screens } });
  };

  const setLevel = (screenKey: string, level: PermLevel) => {
    setDraft((d) => (d ? { ...d, screens: { ...d.screens, [screenKey]: level } } : d));
  };

  const setModuleLevel = (keys: string[], level: PermLevel) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d.screens };
      for (const k of keys) next[k] = level;
      return { ...d, screens: next };
    });
  };

  const savePermissions = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      applySaved(await updatePermissionGroup(draft.code, draft));
      toast.success(`Đã lưu quyền của ${draft.name}`);
    } catch (e: unknown) {
      toast.error(errMsg(e, "Lưu thất bại"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g: PermissionGroup) => {
    if (!window.confirm(`Xoá chức danh ${g.name} (${g.code})?`)) return;
    try {
      await deletePermissionGroup(g.code);
      const rest = groups.filter((x) => x.code !== g.code);
      setGroups(rest);
      if (selected === g.code) {
        setSelected(rest[0]?.code ?? null);
        setDraft(rest[0] ? { ...rest[0], screens: { ...rest[0].screens } } : null);
      }
      toast.success("Đã xoá chức danh");
    } catch (e: unknown) {
      toast.error(errMsg(e, "Xoá thất bại"));
    }
  };

  if (!isApiEnabled()) {
    return <EmptyState>Cần bật API (VITE_API_BASE_URL) để quản lý nhóm quyền.</EmptyState>;
  }
  if (loading) return <EmptyState>Đang tải…</EmptyState>;

  const locked = Boolean(draft?.locked);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Mỗi tài khoản thuộc một chức danh. Quyền theo màn hình: <b>Sửa</b> = xem + ghi, <b>Xem</b> =
        chỉ đọc, <b>Không</b> = ẩn màn. Chức danh Admin luôn full quyền và không sửa được.
      </p>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Section
          title={`Chức danh (${groups.length})`}
          right={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> Thêm
            </Button>
          }
        >
          <div className="space-y-1">
            {groups.map((g) => (
              <div
                key={g.code}
                className={`flex items-center gap-1 rounded-md border pr-1 ${
                  selected === g.code ? "border-primary bg-primary/10" : "hover:bg-muted/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => pick(g.code)}
                  className="min-w-0 flex-1 px-3 py-2 text-left text-sm"
                >
                  <span className="flex items-center gap-1.5 truncate font-medium">
                    {g.name}
                    {g.locked ? (
                      <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : g.builtin ? (
                      <ShieldCheck className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : null}
                    {g.active === false ? (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        Khoá
                      </Badge>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {g.code}
                    {g.staffCount ? ` · ${g.staffCount} tài khoản` : ""}
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title={g.locked ? "Chức danh Admin không sửa được" : "Sửa thông tin chức danh"}
                  disabled={Boolean(g.locked)}
                  onClick={() => setEditing(g)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title={g.builtin ? "Chức danh dựng sẵn không xoá được" : "Xoá chức danh"}
                  disabled={Boolean(g.builtin)}
                  onClick={() => remove(g)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Section>

        {draft ? (
          <Section
            title={`Quyền của ${draft.name}`}
            right={
              <Button size="sm" onClick={savePermissions} disabled={locked || saving}>
                <Save className="mr-1 h-4 w-4" /> {saving ? "Đang lưu…" : "Lưu quyền"}
              </Button>
            }
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Mã <b className="text-foreground">{draft.code}</b> · chức danh gốc{" "}
                <b className="text-foreground">{draft.baseRoleCode || "—"}</b>
                {draft.description ? ` · ${draft.description}` : ""}
              </span>
              {hiddenCount > 0 ? (
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={showHidden}
                    onChange={(e) => setShowHidden(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Hiện {hiddenCount} màn chưa lên menu
                </label>
              ) : null}
            </div>

            {locked ? (
              <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                Chức danh Admin có toàn quyền và không thể bị giới hạn — tránh tự khoá mất quyền
                quản trị.
              </div>
            ) : null}

            <div className="space-y-4">
              {modules.map(([mod, rows]) => (
                <div key={mod}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {mod}
                    </div>
                    <div className="flex gap-1">
                      {LEVELS.map((l) => (
                        <Button
                          key={l.value}
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          disabled={locked}
                          onClick={() =>
                            setModuleLevel(
                              rows.map((r) => r.key),
                              l.value,
                            )
                          }
                        >
                          {l.label} tất cả
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-md border">
                    {rows.map((s) => {
                      const level = (draft.screens[s.key] ?? "N") as PermLevel;
                      return (
                        <div
                          key={s.key}
                          className="flex items-center justify-between gap-3 border-b px-3 py-1.5 last:border-0"
                        >
                          <div className="min-w-0 text-sm">{s.label}</div>
                          <div className="flex shrink-0 gap-1">
                            {LEVELS.map((l) => (
                              <button
                                key={l.value}
                                type="button"
                                disabled={locked}
                                onClick={() => setLevel(s.key, l.value)}
                                className={`rounded border px-2 py-1 text-[11px] ${
                                  level === l.value
                                    ? l.value === "Y"
                                      ? "border-success/50 bg-success/15 text-success"
                                      : l.value === "R"
                                        ? "border-primary/50 bg-primary/10 text-primary"
                                        : "border-muted bg-muted text-muted-foreground"
                                    : "hover:bg-muted/50"
                                } ${locked ? "opacity-60" : ""}`}
                              >
                                {l.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ) : (
          <EmptyState>Chọn một chức danh để xem quyền</EmptyState>
        )}
      </div>

      {creating ? (
        <GroupDialog
          mode="create"
          groups={groups}
          screens={screens}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setGroups((rows) => [...rows, saved]);
            setCreating(false);
            setSelected(saved.code);
            setDraft({ ...saved, screens: { ...saved.screens } });
          }}
        />
      ) : null}

      {editing ? (
        <GroupDialog
          mode="edit"
          group={editing}
          groups={groups}
          screens={screens}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            applySaved(saved);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function GroupDialog({
  mode,
  group,
  groups,
  screens,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  group?: PermissionGroup;
  groups: PermissionGroup[];
  screens: ScreenMeta[];
  onClose: () => void;
  onSaved: (g: PermissionGroup) => void;
}) {
  const isEdit = mode === "edit";
  const [code, setCode] = useState(group?.code ?? "");
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [base, setBase] = useState(group?.baseRoleCode || "Q");
  const [active, setActive] = useState(group?.active !== false);
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isEdit && !code.trim()) return toast.error("Nhập mã chức danh");
    if (!name.trim()) return toast.error("Nhập tên chức danh");
    setBusy(true);
    try {
      if (isEdit && group) {
        // Không gửi screens → BE giữ nguyên quyền đang có (partial update).
        const saved = await updatePermissionGroup(group.code, {
          code: group.code,
          name: name.trim(),
          description: description.trim(),
          baseRoleCode: base,
          active,
        } as PermissionGroup);
        toast.success("Đã cập nhật chức danh");
        onSaved(saved);
        return;
      }
      const source = groups.find((g) => g.code === copyFrom);
      const blank: Record<string, PermLevel> = {};
      for (const s of screens) blank[s.key] = "N";
      const saved = await createPermissionGroup({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim(),
        baseRoleCode: base,
        active,
        builtin: false,
        screens: source ? { ...blank, ...source.screens } : blank,
      });
      toast.success(`Đã tạo chức danh ${saved.name}`);
      onSaved(saved);
    } catch (e: unknown) {
      toast.error(errMsg(e, isEdit ? "Cập nhật thất bại" : "Tạo thất bại"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Sửa chức danh ${group?.code}` : "Thêm chức danh"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Mã chức danh {isEdit ? "" : "* (A-Z, 0-9)"}</Label>
            <Input
              value={code}
              disabled={isEdit}
              onChange={(e) => setCode(e.target.value)}
              placeholder="QUAY_TRUONG"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tên chức danh *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Quầy trưởng"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Chức danh gốc (nghiệp vụ)</Label>
            <SearchableSelect
              value={base}
              onValueChange={setBase}
              disabled={isEdit && Boolean(group?.builtin)}
              options={BASE_ROLES.map((r) => ({ value: r, label: `${ROLE_LABELS[r]} (${r})` }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Trạng thái</Label>
            <SearchableSelect
              value={active ? "1" : "0"}
              onValueChange={(v) => setActive(v === "1")}
              options={[
                { value: "1", label: "Đang dùng" },
                { value: "0", label: "Khoá (tài khoản mất quyền)" },
              ]}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Ghi chú</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {isEdit ? null : (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Nhân bản quyền từ</Label>
              <SearchableSelect
                value={copyFrom || "none"}
                onValueChange={(v) => setCopyFrom(v === "none" ? "" : v)}
                options={[
                  { value: "none", label: "Không (bắt đầu trắng)" },
                  ...groups.map((g) => ({ value: g.code, label: g.name })),
                ]}
              />
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Chức danh gốc dùng cho nghiệp vụ ngoài màn hình (phạm vi văn phòng, chốt ngày, báo cáo).
          {isEdit ? " Sửa ở đây không đổi quyền màn hình đã cấp." : ""}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Đang lưu…" : isEdit ? "Lưu" : "Tạo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
