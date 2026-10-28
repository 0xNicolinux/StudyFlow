"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpenCheck, Brain, Home, Library, ListChecks, NotebookPen, Pencil, Pin, Plus, Settings, Timer, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { rankPanels, type PanelId } from "@/lib/adaptive";
import { IconButton } from "./ui";
import { useAdaptive } from "./use-adaptive";
import { useNow } from "./use-now";
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

// Ordem padrão dos painéis (a mesma de antes da personalização); "Início" fica sempre no topo.
const PANEL_NAV: { kind: PanelId; label: string; icon: typeof Home }[] = [
  { kind: "tasks", label: "Tarefas", icon: ListChecks },
  { kind: "notes", label: "Anotações", icon: NotebookPen },
  { kind: "focus", label: "Foco", icon: Timer },
  { kind: "flashcards", label: "Flashcards", icon: Brain },
  { kind: "quizzes", label: "Quizzes", icon: BookOpenCheck },
  { kind: "library", label: "Biblioteca", icon: Library },
];
const DEFAULT_ORDER = PANEL_NAV.map((p) => p.kind);

// Rótulos somem (sem sair do DOM, para leitores de tela) quando só o trilho de ícones está visível.
const fade = (collapsed: boolean) => cn("truncate transition-opacity duration-150", collapsed && "opacity-0");

const ROW = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors";

export function Sidebar({ view, onNavigate, onNewSubject, onEditSubject, onDeleteSubject, collapsed = false, pin, frozen = false }: Props) {
  const profile = useLiveQuery(() => db.profile.get("me").then((p) => p ?? null), []);
  const subjects = useLiveQuery(() => db.subjects.toArray().then((a) => a.sort((x, y) => x.createdAt - y.createdAt)), []);
  const adaptive = useAdaptive();
  const now = useNow(3_600_000);

  const live = rankPanels(DEFAULT_ORDER, adaptive.panels, now);
  // Ajuste de estado durante a renderização (padrão do React): adota a nova ordem só quando o mouse sai da barra.
  const [order, setOrder] = useState(live);
  if (!frozen && order.join() !== live.join()) setOrder(live);
  const nav = [{ kind: "home" as const, label: "Início", icon: Home }, ...order.map((k) => PANEL_NAV.find((p) => p.kind === k)!)];

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      {pin && (
        <div className="flex items-center gap-2 px-3 pt-3">
          <IconButton label="Fixar barra lateral" aria-pressed={pin.pinned} onClick={pin.onToggle} className={cn(pin.pinned && "bg-accent/15 text-accent hover:bg-accent/25")}>
            <Pin className={cn("size-4 transition-transform", pin.pinned ? "fill-current" : "rotate-45")} aria-hidden />
          </IconButton>
          <span className={cn(fade(collapsed), "text-sm font-semibold")}>StudyFlow</span>
        </div>
      )}

      <button
        onClick={() => onNavigate({ kind: "settings" })}
        className={cn(
          "flex items-center gap-3 rounded-xl border text-left transition-[margin,padding,background-color,border-color]",
          collapsed ? "mx-2.5 my-3 border-transparent bg-transparent p-0" : "m-3 border-line bg-surface-2 p-2.5 hover:bg-surface-3",
        )}
        aria-label="Perfil e configurações"
      >
        {profile?.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photo} alt="" className="size-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
            {initials(profile?.name ?? "Estudante")}
          </span>
        )}
        <span className={cn("min-w-0 transition-opacity duration-150", collapsed && "opacity-0")}>
          <span className="block truncate text-sm font-medium">{profile?.name ?? "Estudante"}</span>
          <span className="block text-xs text-muted">Perfil local</span>
        </span>
      </button>

      <nav aria-label="Principal" className="space-y-0.5 px-2">
        {nav.map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            onClick={() => onNavigate({ kind })}
            aria-current={view.kind === kind ? "page" : undefined}
            className={cn(ROW, view.kind === kind ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}
          >
            <Icon className="size-4 shrink-0" aria-hidden /> <span className={fade(collapsed)}>{label}</span>
          </button>
        ))}
      </nav>

      <div className="mx-3 mt-3 border-t border-line" />
      <div className={cn("mt-2 flex items-center justify-between px-5 transition-opacity", collapsed && "opacity-0")}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Disciplinas</h2>
        <IconButton label="Nova disciplina" onClick={onNewSubject}><Plus className="size-4" /></IconButton>
      </div>

      <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {subjects === undefined && <div className="h-9 animate-pulse rounded-lg bg-surface-2" />}
        {subjects?.length === 0 && (
          <p className={cn("px-3 py-3 text-sm text-muted transition-opacity", collapsed && "opacity-0")}>Nenhuma disciplina ainda. Use o botão + para criar a primeira.</p>
        )}
        {subjects?.map((s) => {
          const active = view.kind === "subject" && view.id === s.id;
          return (
            <div key={s.id} className={cn("group flex items-center rounded-lg transition-colors", active ? "bg-surface-3" : "hover:bg-surface-2")}>
              <button
                onClick={() => onNavigate({ kind: "subject", id: s.id })}
                aria-current={active ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm"
              >
                <span className="flex size-4 shrink-0 items-center justify-center"><span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden /></span>
                <span className={cn(fade(collapsed), active ? "text-fg" : "text-muted group-hover:text-fg")}>{s.name}</span>
              </button>
              <span className="flex pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                <IconButton label={`Editar ${s.name}`} onClick={() => onEditSubject(s)}><Pencil className="size-3.5" /></IconButton>
                <IconButton label={`Excluir ${s.name}`} onClick={() => onDeleteSubject(s)}><Trash2 className="size-3.5" /></IconButton>
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line p-2">
        <button
          onClick={() => onNavigate({ kind: "settings" })}
          aria-current={view.kind === "settings" ? "page" : undefined}
          className={cn(ROW, view.kind === "settings" ? "bg-surface-3" : "text-muted hover:bg-surface-2 hover:text-fg")}
        >
          <Settings className="size-4 shrink-0" aria-hidden /> <span className={fade(collapsed)}>Configurações</span>
        </button>
      </div>
    </div>
  );
}
