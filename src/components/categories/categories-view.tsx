"use client";

import { FolderTree, Hash, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/layout/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { DynIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { ColorPicker, IconPicker } from "@/components/ui/pickers";
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonList } from "@/components/ui/panel";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { readableOn } from "@/lib/color";
import type { CategoryDto, TagDto } from "@/lib/types";
import { errMsg, qs, useApiQuery } from "@/lib/use-api";
import { categoryCreateBody } from "@/lib/validation/categories";
import { tagCreateBody } from "@/lib/validation/tags";

export function CategoriesView() {
  const [tab, setTab] = useState("categories");
  return (
    <div>
      <PageHeader title="Categorías y etiquetas" subtitle="Organiza eventos y tareas con colores, iconos y etiquetas." />
      <Tabs
        className="mb-4 w-fit max-w-full"
        label="Sección"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "categories", label: "Categorías", icon: <FolderTree className="size-3.5" aria-hidden /> },
          { id: "tags", label: "Etiquetas", icon: <Hash className="size-3.5" aria-hidden /> },
        ]}
      />
      {tab === "categories" ? <Categories /> : <Tags />}
    </div>
  );
}

function Categories() {
  const app = useApp();
  const toast = useToast();
  const q = useApiQuery<CategoryDto[]>(`/api/v1/categories${qs({ pageSize: 100 })}`);
  const [edit, setEdit] = useState<{ c: CategoryDto | null } | null>(null);
  const [del, setDel] = useState<CategoryDto | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(c: CategoryDto) {
    try {
      await apiFetch(`/api/v1/categories/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } });
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/categories/${del.id}`, { method: "DELETE" });
      toast.success("Categoría eliminada");
      setDel(null);
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={() => setEdit({ c: null })}>
          <Plus className="size-4" aria-hidden /> Nueva categoría
        </Button>
      </div>
      {q.loading ? (
        <SkeletonList rows={5} />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon={<FolderTree />} title="Sin categorías" description="Crea la primera para colorear tus eventos." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(q.data ?? []).map((c) => (
            <Panel key={c.id} className="glow-hover flex items-center gap-3 p-3 md:p-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-card" style={{ background: c.color, color: readableOn(c.color) }}>
                <DynIcon name={c.icon} className="size-5" fallback="tag" />
              </span>
              <button type="button" onClick={() => setEdit({ c })} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium hover:text-accent">{c.name}</span>
                <span className="block truncate text-xs text-muted">{c.description || "Sin descripción"}</span>
              </button>
              {!c.isActive && <Badge>Inactiva</Badge>}
              <Menu
                label={`Acciones de ${c.name}`}
                triggerClass="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-fg md:size-8"
                trigger={<MoreHorizontal className="size-4" aria-hidden />}
                items={[
                  { label: "Editar", icon: <Pencil className="size-4" aria-hidden />, onSelect: () => setEdit({ c }) },
                  { label: c.isActive ? "Desactivar" : "Activar", icon: <FolderTree className="size-4" aria-hidden />, onSelect: () => void toggle(c) },
                  { label: "Eliminar", icon: <Trash2 className="size-4" aria-hidden />, onSelect: () => setDel(c), danger: true },
                ]}
              />
            </Panel>
          ))}
        </div>
      )}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.c ? "Editar categoría" : "Nueva categoría"}>
        {edit && <CategoryForm c={edit.c} onClose={() => setEdit(null)} />}
      </Dialog>
      <ConfirmDialog open={!!del} title="¿Eliminar categoría?" description={del ? `«${del.name}». Los eventos y tareas asociados quedarán sin categoría.` : undefined} confirmLabel="Eliminar" danger loading={busy} onConfirm={() => void remove()} onClose={() => setDel(null)} />
    </>
  );
}

function CategoryForm({ c, onClose }: { c: CategoryDto | null; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [name, setName] = useState(c?.name ?? "");
  const [description, setDescription] = useState(c?.description ?? "");
  const [color, setColor] = useState<string | null>(c?.color ?? "#2563eb");
  const [icon, setIcon] = useState<string | null>(c?.icon ?? null);
  const [isActive, setActive] = useState(c?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const body = { name: name.trim(), description: description.trim() || null, color: color ?? "#2563eb", icon, isActive };
    const parsed = categoryCreateBody.safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
    setSaving(true);
    try {
      if (c) await apiFetch(`/api/v1/categories/${c.id}`, { method: "PATCH", body });
      else await apiFetch("/api/v1/categories", { method: "POST", body });
      toast.success(c ? "Categoría actualizada" : "Categoría creada");
      app.bump();
      onClose();
    } catch (e) {
      setError(errMsg(e));
      setSaving(false);
    }
  }
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Field label="Nombre">{(p) => <Input {...p} autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Descripción">{(p) => <Textarea {...p} className="min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      <div className="space-y-1.5"><p className="t-label">Color</p><ColorPicker value={color} onChange={setColor} /></div>
      <div className="space-y-1.5"><p className="t-label">Icono</p><IconPicker value={icon} onChange={setIcon} /></div>
      <Switch checked={isActive} onChange={setActive} label="Activa" description="Las inactivas no se ofrecen al crear eventos." />
      {error && <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={saving}>{c ? "Guardar" : "Crear categoría"}</Button>
      </div>
    </form>
  );
}

function Tags() {
  const app = useApp();
  const toast = useToast();
  const q = useApiQuery<TagDto[]>(`/api/v1/tags${qs({ pageSize: 100 })}`);
  const [edit, setEdit] = useState<{ t: TagDto | null } | null>(null);
  const [del, setDel] = useState<TagDto | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!del) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/tags/${del.id}`, { method: "DELETE" });
      toast.success("Etiqueta eliminada");
      setDel(null);
      app.bump();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={() => setEdit({ t: null })}>
          <Plus className="size-4" aria-hidden /> Nueva etiqueta
        </Button>
      </div>
      {q.loading ? (
        <SkeletonList rows={4} />
      ) : q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon={<Hash />} title="Sin etiquetas" description="Se crean al escribirlas en un evento o tarea, o aquí." />
      ) : (
        <Panel className="p-2 md:p-2">
          <ul className="divide-y divide-line">
            {(q.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-2 py-3">
                <span aria-hidden className="size-3 shrink-0 rounded-full border border-black/10" style={{ background: t.color ?? "var(--line-strong)" }} />
                <button type="button" onClick={() => setEdit({ t })} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent">#{t.name}</button>
                <span className="font-mono text-[11px] text-muted">{t.usage?.events ?? 0} eventos · {t.usage?.tasks ?? 0} tareas</span>
                <Menu
                  label={`Acciones de ${t.name}`}
                  triggerClass="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-fg md:size-8"
                  trigger={<MoreHorizontal className="size-4" aria-hidden />}
                  items={[
                    { label: "Editar", icon: <Pencil className="size-4" aria-hidden />, onSelect: () => setEdit({ t }) },
                    { label: "Eliminar", icon: <Trash2 className="size-4" aria-hidden />, onSelect: () => setDel(t), danger: true },
                  ]}
                />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.t ? "Editar etiqueta" : "Nueva etiqueta"} size="sm">
        {edit && <TagForm t={edit.t} onClose={() => setEdit(null)} />}
      </Dialog>
      <ConfirmDialog open={!!del} title="¿Eliminar etiqueta?" description={del ? `«${del.name}» se quitará de los eventos y tareas que la usan.` : undefined} confirmLabel="Eliminar" danger loading={busy} onConfirm={() => void remove()} onClose={() => setDel(null)} />
    </>
  );
}

function TagForm({ t, onClose }: { t: TagDto | null; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [name, setName] = useState(t?.name ?? "");
  const [color, setColor] = useState<string | null>(t?.color ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setError(null);
    const body = { name: name.trim(), color };
    const parsed = tagCreateBody.safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
    setSaving(true);
    try {
      if (t) await apiFetch(`/api/v1/tags/${t.id}`, { method: "PATCH", body });
      else await apiFetch("/api/v1/tags", { method: "POST", body });
      toast.success(t ? "Etiqueta actualizada" : "Etiqueta creada");
      app.bump();
      onClose();
    } catch (e) {
      setError(errMsg(e));
      setSaving(false);
    }
  }
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Field label="Nombre">{(p) => <Input {...p} autoFocus required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="space-y-1.5"><p className="t-label">Color</p><ColorPicker value={color} onChange={setColor} allowNone /></div>
      {error && <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={saving}>{t ? "Guardar" : "Crear etiqueta"}</Button>
      </div>
    </form>
  );
}
