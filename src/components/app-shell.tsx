"use client";
import { useState, type CSSProperties } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Menu, MessageSquare, Timer, X } from "lucide-react";
import { db } from "@/lib/db";
import { deleteSubject } from "@/lib/repo";
import { readableOn } from "@/lib/adaptive";
import { cn } from "@/lib/cn";
import { Sidebar } from "./sidebar";
import { SubjectDialog } from "./subject-dialog";
import { HomeDashboard, SubjectDashboard, TAB_PANEL, type SubjectTab } from "./dashboards";
import { TasksPanel } from "./tasks-panel";
import { NotesPanel } from "./notes-panel";
import { SettingsPanel } from "./settings-panel";
import { ProfilePanel } from "./profile-panel";
import { FocusPanel } from "./focus-panel";
import { FlashcardsPanel } from "./flashcards-panel";
import { QuizzesPanel } from "./quizzes-panel";
import { LibraryPanel } from "./library-panel";
import { ChatCtx } from "./chat-context";
import { usePomodoro } from "./use-pomodoro";
import { ChatView } from "./chat-view";
import { Composer } from "./composer";
import { useChat } from "./use-chat";
import { useSidebar } from "./use-sidebar";
import { trackPanel, trackSubject, untrackSubject } from "./use-adaptive";
import { themeStore } from "@/lib/theme-pref";
import { useLocalStore } from "./use-local-store";
import { IconButton, Loading } from "./ui";
import type { Subject } from "@/lib/schemas";

export type View =
  | { kind: "home" }
  | { kind: "tasks" }
  | { kind: "notes" }
  | { kind: "focus" }
  | { kind: "flashcards" }
  | { kind: "quizzes" }
  | { kind: "library" }
  | { kind: "settings" }
  | { kind: "profile" }
  | { kind: "subject"; id: string; tab?: SubjectTab };

const TITLES: Record<Exclude<View["kind"], "subject">, string> = {
  home: "Início",
  tasks: "Tarefas",
  notes: "Anotações",
  focus: "Foco",
  flashcards: "Flashcards",
  quizzes: "Quizzes",
  library: "Biblioteca de materiais",
  settings: "Configurações",
  profile: "Perfil",
};

export function AppShell() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [chatOpen, setChatOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; subject: Subject | null }>({ open: false, subject: null });

  const side = useSidebar();
  const { accent: preferredAccent } = useLocalStore(themeStore);
  const timer = usePomodoro();
  const chat = useChat(view.kind === "subject" ? view.id : null);
  const activeSubject = useLiveQuery(async () => (view.kind === "subject" ? ((await db.subjects.get(view.id)) ?? null) : undefined), [view]);

  function navigate(v: View) {
    // Registra só no aparelho: alimenta a ordem dos painéis e as sugestões (clicar no item já aberto não conta).
    if (v.kind !== view.kind || (v.kind === "subject" && view.kind === "subject" && v.id !== view.id)) {
      if (v.kind === "subject") trackSubject(v.id);
      else if (v.kind !== "home" && v.kind !== "settings" && v.kind !== "profile") trackPanel(v.kind);
    }
    if (v.kind === "subject" && v.tab && TAB_PANEL[v.tab]) trackPanel(TAB_PANEL[v.tab]!, v.id);
    setView(v);
    setChatOpen(false);
    setDrawer(false);
  }

  async function removeSubject(s: Subject) {
    if (!window.confirm(`Excluir "${s.name}"? Tarefas, anotações, flashcards, quizzes e materiais desta disciplina também serão excluídos. O tempo de estudo registrado é mantido.`)) return;
    await deleteSubject(s.id);
    untrackSubject(s.id);
    if (view.kind === "subject" && view.id === s.id) navigate({ kind: "home" });
  }

  const title = chatOpen ? "Conversa" : view.kind === "subject" ? (activeSubject?.name ?? "Disciplina") : TITLES[view.kind];

  let content;
  if (chatOpen) content = <ChatView chat={chat} subjectId={view.kind === "subject" ? view.id : null} onBack={() => setChatOpen(false)} onOpenSettings={() => navigate({ kind: "settings" })} />;
  else if (view.kind === "home") content = <HomeDashboard onNavigate={navigate} onNewSubject={() => setDialog({ open: true, subject: null })} />;
  else if (view.kind === "tasks") content = <TasksPanel />;
  else if (view.kind === "notes") content = <NotesPanel />;
  else if (view.kind === "focus") content = <FocusPanel timer={timer} />;
  else if (view.kind === "flashcards") content = <FlashcardsPanel />;
  else if (view.kind === "quizzes") content = <QuizzesPanel />;
  else if (view.kind === "library") content = <LibraryPanel />;
  else if (view.kind === "settings") content = <SettingsPanel />;
  else if (view.kind === "profile") content = <ProfilePanel />;
  else if (activeSubject === undefined) content = <Loading />;
  else if (activeSubject === null) content = <p className="text-sm text-muted">Esta disciplina não existe mais.</p>;
  else content = <SubjectDashboard key={activeSubject.id} subject={activeSubject} initialTab={view.kind === "subject" ? view.tab : undefined} onNavigate={navigate} />;

  const sidebarProps = {
    view,
    onNavigate: navigate,
    onNewSubject: () => setDialog({ open: true, subject: null }),
    onEditSubject: (s: Subject) => setDialog({ open: true, subject: s }),
    onDeleteSubject: removeSubject,
  };

  // Ao entrar numa disciplina, o acento da área de trabalho assume a cor dela (botões, abas, foco).
  const accent: CSSProperties = view.kind === "subject" && activeSubject
    ? ({ "--accent": activeSubject.color, "--accent-fg": readableOn(activeSubject.color) } as CSSProperties)
    : ({ "--accent": preferredAccent, "--accent-fg": readableOn(preferredAccent) } as CSSProperties);

  return (
    <ChatCtx.Provider value={chat}>
    <div className="app-shell-root flex h-dvh">
      {/* Reserva o espaço no layout (largo se fixada, só o trilho se não); a barra em si flutua por cima ao expandir. */}
      <div className={cn("relative hidden shrink-0 md:block", side.animate && "transition-[width] duration-200 ease-out", side.pinned ? "w-72" : "w-14")}>
        <aside
          aria-label="Barra lateral"
          {...side.handlers}
          className={cn(
            "app-sidebar absolute inset-y-0 left-0 z-30 overflow-hidden border-r border-line bg-surface",
            side.animate && "transition-[width,box-shadow] duration-200 ease-out",
            side.expanded ? "w-72" : "w-14",
            side.expanded && !side.pinned && "shadow-2xl shadow-black/50",
          )}
        >
          <div className={cn("h-full", side.expanded ? "w-72" : "w-14")}>
            <Sidebar {...sidebarProps} collapsed={!side.expanded} frozen={side.pointerInside} pin={{ pinned: side.pinned, onToggle: side.togglePin }} />
          </div>
        </aside>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="app-sidebar fade-in absolute inset-y-0 left-0 flex w-[min(85vw,20rem)] flex-col border-r border-line bg-surface shadow-xl">
            <div className="flex justify-end px-2 pt-2">
              <IconButton label="Fechar menu" onClick={() => setDrawer(false)}><X className="size-4" /></IconButton>
            </div>
            <div className="min-h-0 flex-1"><Sidebar {...sidebarProps} /></div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col" style={accent}>
        <header className="app-topbar flex items-center gap-3 border-b border-line px-4 py-3 md:px-6">
          <IconButton label="Abrir menu" onClick={() => setDrawer(true)} className="md:hidden"><Menu className="size-5" /></IconButton>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              {view.kind === "subject" && activeSubject && (
                <span className="discipline-title-mark flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold" style={{ background: activeSubject.color, color: readableOn(activeSubject.color) }} aria-hidden>
                  {activeSubject.icon?.startsWith("data:image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activeSubject.icon} alt="" className="size-full object-cover" />
                  ) : activeSubject.icon ? activeSubject.icon : activeSubject.name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")}
                </span>
              )}
              <h1 className="truncate text-base font-semibold">{title}</h1>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {timer.state.status !== "idle" && view.kind !== "focus" && !chatOpen && (
              <button onClick={() => navigate({ kind: "focus" })} aria-label={`Cronômetro de ${timer.state.phase === "focus" ? "foco" : "descanso"}: ${timer.clock}. Abrir`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm tabular-nums transition-colors hover:bg-surface-3">
                <Timer className="size-3.5 text-accent" aria-hidden /> {timer.clock}{timer.state.status === "paused" && <span className="text-xs text-muted">pausado</span>}
              </button>
            )}
            <IconButton label={view.kind === "subject" ? "Conversas desta disciplina" : "Conversas"} aria-pressed={chatOpen} onClick={() => setChatOpen((v) => !v)} className={cn(chatOpen && "bg-accent/15 text-accent")}>
              <MessageSquare className="size-4" />
            </IconButton>
          </div>
        </header>

        <main className="app-workspace min-h-0 flex-1 overflow-y-auto p-4 md:p-7 xl:p-8" id="workspace">
          <div className="workspace-content">{content}</div>
        </main>

        <Composer chat={chat} activeSubjectId={view.kind === "subject" ? view.id : null} onSubmitted={() => setChatOpen(true)} />
      </div>

      <SubjectDialog
        open={dialog.open}
        subject={dialog.subject}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
        onSaved={(s) => { if (!dialog.subject) navigate({ kind: "subject", id: s.id }); }}
      />
    </div>
    </ChatCtx.Provider>
  );
}
