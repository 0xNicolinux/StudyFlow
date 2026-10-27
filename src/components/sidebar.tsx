"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { Home, ListChecks, NotebookPen, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { IconButton } from "./ui";
import type { Subject } from "@/lib/schemas";
import type { View } from "./app-shell";

type Props = {
  view: View;
  onNavigate: (v: View) => void;
  onNewSubject: () => void;
  onEditSubject: (s: Subject) => void;
  onDeleteSubject: (s: Subject) => void;
};

export function Sidebar({ view, onNavigate, onNewSubject, onEditSubject, onDeleteSubject }: Props) {
  const profile = useLiveQuery(() => db.profile.get("me").then((p) => p ?? null), []);
  const subjects = useLiveQuery(() => db.subjects.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), []);
  const nav = [
    { kind: "home", label: "Início", icon: Home },
    { kind: "tasks", label: "Tarefas", icon: ListChecks },
    { kind: "notes", label: "Anotações", icon: NotebookPen },
  ] as const;

  return (
    <div className="flex h-full flex-col bg-surface">
      <button
        onClick={() => onNavigate({ kind: "settings" })}
        className="m-3 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-2.5 text-left hover:bg-surface-3 transition-colors"
        aria-label="Perfil e configurações"
      >
        {profile?.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photo} alt="" className="size-9 rounded-full object-cover" />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
            {initials(profile?.name ?? "Estudante")}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{profile?.name ?? "Estudante"}</span>
          <span className="block text-xs text-muted">Perfil local</span>
        </span>
      </button>

      <nav aria-label="Principal" className="space-y-0.5 px-3">
        {nav.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            onClick={() => onNavigate({ kind })}
            aria-current={view.kind === kind ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              view.kind === kind ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </nav>

      <div className="mt-4 flex items-center justify-between px-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Disciplinas</h2>
        <IconButton label="Nova disciplina" onClick={onNewSubject}><Plus className="size-4" /></IconButton>
      </div>

      <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {subjects === undefined && <div className="h-9 animate-pulse rounded-lg bg-surface-2" />}
        {subjects?.length === 0 && (
          <p className="px-2.5 py-3 text-sm text-muted">Nenhuma disciplina ainda. Use o botão + para criar a primeira.</p>
        )}
        {subjects?.map((s) => {
          const active = view.kind === "subject" && view.id === s.id;
          return (
            <div key={s.id} className={cn("group flex items-center rounded-lg transition-colors", active ? "bg-surface-3" : "hover:bg-surface-2")}>
              <button
                onClick={() => onNavigate({ kind: "subject", id: s.id })}
                aria-current={active ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-sm"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className={cn("truncate", active ? "text-fg" : "text-muted group-hover:text-fg")}>{s.name}</span>
              </button>
              <span className="flex pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                <IconButton label={`Editar ${s.name}`} onClick={() => onEditSubject(s)}><Pencil className="size-3.5" /></IconButton>
                <IconButton label={`Excluir ${s.name}`} onClick={() => onDeleteSubject(s)}><Trash2 className="size-3.5" /></IconButton>
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line p-3">
        <button
          onClick={() => onNavigate({ kind: "settings" })}
          aria-current={view.kind === "settings" ? "page" : undefined}
          className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors", view.kind === "settings" ? "bg-surface-3" : "text-muted hover:bg-surface-2 hover:text-fg")}
        >
          <Settings className="size-4" aria-hidden /> Configurações
        </button>
      </div>
    </div>
  );
}
