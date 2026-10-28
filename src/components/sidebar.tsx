"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { BookOpenCheck, Brain, Home, Library, ListChecks, NotebookPen, Pencil, Pin, Plus, Settings, Timer, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { readableOn } from "@/lib/adaptive";
import { IconButton } from "./ui";
import type { Subject } from "@/lib/schemas";
import type { View } from "./app-shell";

type Props = {
  view: View;
  onNavigate: (v: View) => void;
  onNewSubject: () => void;
  onEditSubject: (s: Subject) => void;
  onDeleteSubject: (s: Subject) => void;
  /** Trilho de ícones: só o ícone de cada item fica visível (a largura é controlada por quem renderiza). */
  collapsed?: boolean;
  /** Presente apenas no desktop; o menu do celular não tem botão de fixar. */
  pin?: { pinned: boolean; onToggle: () => void };
  /** Enquanto o mouse está sobre a barra a ordem dos painéis não muda, para não mover o alvo sob o cursor. */
  frozen?: boolean;
};

// Ordem fixa para preservar a memória muscular: a navegação não muda sozinha.
const PANEL_NAV = [
  { kind: "quizzes", label: "Quizzes", icon: BookOpenCheck },
  { kind: "notes", label: "Anotações", icon: NotebookPen },
  { kind: "tasks", label: "Tarefas", icon: ListChecks },
  { kind: "focus", label: "Foco", icon: Timer },
  { kind: "flashcards", label: "Flashcards", icon: Brain },
  { kind: "library", label: "Biblioteca", icon: Library },
] as const;

// Rótulos somem (sem sair do DOM, para leitores de tela) quando só o trilho de ícones está visível.
const fade = (collapsed: boolean) => cn("truncate transition-opacity duration-150", collapsed && "opacity-0");

const ROW = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors";

export function Sidebar({ view, onNavigate, onNewSubject, onEditSubject, onDeleteSubject, collapsed = false, pin }: Props) {
  const profile = useLiveQuery(() => db.profile.get("me").then((p) => p ?? null), []);
  const subjects = useLiveQuery(() => db.subjects.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), []);
  const nav = [{ kind: "home" as const, label: "Início", icon: Home }, ...PANEL_NAV];

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className={cn("sidebar-profile-row flex items-center gap-1", collapsed ? "mx-2 my-3 justify-center" : "mx-3 mb-3 mt-2")}>
        <button
          onClick={() => onNavigate({ kind: "settings" })}
          className={cn("sidebar-profile flex min-w-0 items-center gap-3 text-left", collapsed ? "justify-center" : "flex-1")}
          aria-label="Perfil e configurações"
          title={collapsed ? profile?.name ?? "Estudante" : undefined}
        >
          {profile?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.photo} alt="" className="size-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
              {initials(profile?.name ?? "Estudante")}
            </span>
          )}
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{profile?.name ?? "Estudante"}</span>
              <span className="block text-xs text-muted">Perfil local</span>
            </span>
          )}
        </button>
        {pin && !collapsed && (
          <IconButton label="Fixar barra lateral" aria-pressed={pin.pinned} onClick={pin.onToggle} className={cn(pin.pinned && "text-fg")}>
            <Pin className={cn("size-4 transition-transform", pin.pinned ? "fill-current" : "rotate-45")} aria-hidden />
          </IconButton>
        )}
      </div>

      <nav aria-label="Principal" className="space-y-0.5 px-2">
        {nav.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            onClick={() => onNavigate({ kind })}
            aria-current={view.kind === kind ? "page" : undefined}
            className={cn(ROW, "sidebar-nav-item", view.kind === kind ? "text-fg" : "", collapsed && "justify-center px-0")}
          >
            <Icon className="size-4 shrink-0" aria-hidden /> <span className={cn(fade(collapsed), collapsed && "w-0")}>{label}</span>
          </button>
        ))}
      </nav>

      <div className="h-3 shrink-0" />
      {!collapsed && (
        <div className="mt-2 flex items-center justify-between px-3">
          <h2 className="sidebar-section-label">Disciplinas</h2>
          <IconButton label="Nova disciplina" onClick={onNewSubject}><Plus className="size-4" /></IconButton>
        </div>
      )}

      <div className={cn("mt-1 min-h-0 space-y-0.5 overflow-y-auto px-2 pb-2", collapsed ? "max-h-[42%] flex-none" : "flex-1")}>
        {subjects === undefined && <div className="h-9 animate-pulse rounded-lg bg-surface-2" />}
        {subjects?.length === 0 && (
          <p className={cn("px-3 py-3 text-sm text-muted transition-opacity", collapsed && "opacity-0")}>Nenhuma disciplina ainda. Use o botão + para criar a primeira.</p>
        )}
        {subjects?.map((s) => {
          const active = view.kind === "subject" && view.id === s.id;
          return (
            <div key={s.id} className={cn("sidebar-subject-item group flex items-center rounded-lg transition-colors", active ? "is-active" : "")}>
              <button
                onClick={() => onNavigate({ kind: "subject", id: s.id })}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm", collapsed && "justify-center px-0")}
              >
                <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold" style={{ background: s.color, color: readableOn(s.color) }} aria-hidden>
                  {s.icon?.startsWith("data:image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.icon} alt="" className="size-full object-cover" />
                  ) : s.icon ? s.icon : s.name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")}
                </span>
                <span className={cn(fade(collapsed), active ? "text-fg" : "text-muted group-hover:text-fg", collapsed && "w-0")}>{s.name}</span>
              </button>
              <span className="flex pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                <IconButton label={`Editar ${s.name}`} onClick={() => onEditSubject(s)}><Pencil className="size-3.5" /></IconButton>
                <IconButton label={`Excluir ${s.name}`} onClick={() => onDeleteSubject(s)}><Trash2 className="size-3.5" /></IconButton>
              </span>
            </div>
          );
        })}
      </div>

      {collapsed && (
        <div className="flex justify-center px-2 pb-2">
          <IconButton label="Nova disciplina" onClick={onNewSubject}><Plus className="size-4" /></IconButton>
        </div>
      )}

      <div className="sidebar-footer mt-auto border-t border-line p-2">
        <button
          onClick={() => onNavigate({ kind: "settings" })}
          aria-current={view.kind === "settings" ? "page" : undefined}
          className={cn(ROW, "sidebar-nav-item", view.kind === "settings" ? "text-fg" : "", collapsed && "justify-center px-0")}
        >
          <Settings className="size-4 shrink-0" aria-hidden /> <span className={cn(fade(collapsed), collapsed && "w-0")}>Configurações</span>
        </button>
      </div>
    </div>
  );
}
