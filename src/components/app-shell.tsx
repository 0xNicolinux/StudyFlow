"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Menu, Timer, X } from "lucide-react";
import { db } from "@/lib/db";
import { deleteSubject } from "@/lib/repo";
import { Sidebar } from "./sidebar";
import { SubjectDialog } from "./subject-dialog";
import { HomeDashboard, SubjectDashboard } from "./dashboards";
import { TasksPanel } from "./tasks-panel";
import { NotesPanel } from "./notes-panel";
import { SettingsPanel } from "./settings-panel";
import { FocusPanel } from "./focus-panel";
import { FlashcardsPanel } from "./flashcards-panel";
import { QuizzesPanel } from "./quizzes-panel";
import { LibraryPanel } from "./library-panel";
import { ChatCtx } from "./chat-context";
import { usePomodoro } from "./use-pomodoro";
import { ChatView } from "./chat-view";
import { Composer } from "./composer";
import { useChat } from "./use-chat";
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
  | { kind: "subject"; id: string };

const TITLES: Record<Exclude<View["kind"], "subject">, string> = {
  home: "Início",
  tasks: "Tarefas",
  notes: "Anotações",
  focus: "Foco",
  flashcards: "Flashcards",
  quizzes: "Quizzes",
  library: "Biblioteca de materiais",
  settings: "Configurações",
};

export function AppShell() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [chatOpen, setChatOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; subject: Subject | null }>({ open: false, subject: null });

  const timer = usePomodoro();
  const chat = useChat(view.kind === "subject" ? view.id : null);
  const activeSubject = useLiveQuery(async () => (view.kind === "subject" ? ((await db.subjects.get(view.id)) ?? null) : undefined), [view]);

  function navigate(v: View) {
    setView(v);
    setChatOpen(false);
    setDrawer(false);
  }

  async function removeSubject(s: Subject) {
    if (!window.confirm(`Excluir "${s.name}"? Tarefas, anotações, flashcards, quizzes e materiais desta disciplina também serão excluídos. O tempo de estudo registrado é mantido.`)) return;
    await deleteSubject(s.id);
    if (view.kind === "subject" && view.id === s.id) navigate({ kind: "home" });
  }

  const title = chatOpen ? "Conversa" : view.kind === "subject" ? (activeSubject?.name ?? "Disciplina") : TITLES[view.kind];

  let content;
  if (chatOpen) content = <ChatView chat={chat} onBack={() => setChatOpen(false)} onOpenSettings={() => navigate({ kind: "settings" })} />;
  else if (view.kind === "home") content = <HomeDashboard onNavigate={navigate} />;
  else if (view.kind === "tasks") content = <TasksPanel />;
  else if (view.kind === "notes") content = <NotesPanel />;
  else if (view.kind === "focus") content = <FocusPanel timer={timer} />;
  else if (view.kind === "flashcards") content = <FlashcardsPanel />;
  else if (view.kind === "quizzes") content = <QuizzesPanel />;
  else if (view.kind === "library") content = <LibraryPanel />;
  else if (view.kind === "settings") content = <SettingsPanel />;
  else if (activeSubject === undefined) content = <Loading />;
  else if (activeSubject === null) content = <p className="text-sm text-muted">Esta disciplina não existe mais.</p>;
  else content = <SubjectDashboard key={activeSubject.id} subject={activeSubject} />;

  const sidebar = (
    <Sidebar
      view={view}
      onNavigate={navigate}
      onNewSubject={() => setDialog({ open: true, subject: null })}
      onEditSubject={(s) => setDialog({ open: true, subject: s })}
      onDeleteSubject={removeSubject}
    />
  );

  return (
    <ChatCtx.Provider value={chat}>
    <div className="flex h-dvh">
      <aside className="hidden w-72 shrink-0 border-r border-line md:block">{sidebar}</aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="fade-in absolute inset-y-0 left-0 flex w-[min(85vw,20rem)] flex-col border-r border-line bg-surface shadow-xl">
            <div className="flex justify-end px-2 pt-2">
              <IconButton label="Fechar menu" onClick={() => setDrawer(false)}><X className="size-4" /></IconButton>
            </div>
            <div className="min-h-0 flex-1">{sidebar}</div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <IconButton label="Abrir menu" onClick={() => setDrawer(true)} className="md:hidden"><Menu className="size-5" /></IconButton>
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {timer.state.status !== "idle" && view.kind !== "focus" && !chatOpen && (
            <button onClick={() => navigate({ kind: "focus" })} aria-label={`Cronômetro de ${timer.state.phase === "focus" ? "foco" : "descanso"}: ${timer.clock}. Abrir`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-sm tabular-nums hover:bg-surface-3">
              <Timer className="size-3.5 text-accent" aria-hidden /> {timer.clock}{timer.state.status === "paused" && <span className="text-xs text-muted">pausado</span>}
            </button>
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6" id="workspace">
          <div className="mx-auto max-w-5xl">{content}</div>
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
