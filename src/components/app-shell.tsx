"use client";
import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Menu, SendHorizontal, X } from "lucide-react";
import { db } from "@/lib/db";
import { deleteSubject } from "@/lib/repo";
import { Sidebar } from "./sidebar";
import { SubjectDialog } from "./subject-dialog";
import { HomeDashboard, SubjectDashboard } from "./dashboards";
import { TasksPanel } from "./tasks-panel";
import { NotesPanel } from "./notes-panel";
import { SettingsPanel } from "./settings-panel";
import { ChatView, type ChatMessage } from "./chat-view";
import { IconButton, Loading } from "./ui";
import type { Subject } from "@/lib/schemas";

export type View =
  | { kind: "home" }
  | { kind: "tasks" }
  | { kind: "notes" }
  | { kind: "settings" }
  | { kind: "subject"; id: string };

const TITLES: Record<Exclude<View["kind"], "subject">, string> = {
  home: "Início",
  tasks: "Tarefas",
  notes: "Anotações",
  settings: "Configurações",
};

export function AppShell() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; subject: Subject | null }>({ open: false, subject: null });
  const idRef = useRef(0);

  const activeSubject = useLiveQuery(async () => (view.kind === "subject" ? ((await db.subjects.get(view.id)) ?? null) : undefined), [view]);

  function navigate(v: View) {
    setView(v);
    setChatOpen(false);
    setDrawer(false);
  }

  async function removeSubject(s: Subject) {
    if (!window.confirm(`Excluir "${s.name}"? As tarefas e anotações desta disciplina também serão excluídas.`)) return;
    await deleteSubject(s.id);
    if (view.kind === "subject" && view.id === s.id) navigate({ kind: "home" });
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const next = () => String(++idRef.current);
    setMessages((m) => [
      ...m,
      { id: next(), role: "user", text },
      { id: next(), role: "notice", text: "Nenhum provedor de IA está configurado, então esta mensagem não foi enviada a nenhum serviço. A integração com IA ainda não existe nesta versão." },
    ]);
    setDraft("");
    setChatOpen(true);
  }

  const title = chatOpen ? "Conversa" : view.kind === "subject" ? (activeSubject?.name ?? "Disciplina") : TITLES[view.kind];

  let content;
  if (chatOpen) content = <ChatView messages={messages} onBack={() => setChatOpen(false)} />;
  else if (view.kind === "home") content = <HomeDashboard onNavigate={navigate} />;
  else if (view.kind === "tasks") content = <TasksPanel />;
  else if (view.kind === "notes") content = <NotesPanel />;
  else if (view.kind === "settings") content = <SettingsPanel />;
  else if (activeSubject === undefined) content = <Loading />;
  else if (activeSubject === null) content = <p className="text-sm text-muted">Esta disciplina não existe mais.</p>;
  else content = <SubjectDashboard subject={activeSubject} />;

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
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6" id="workspace">
          <div className="mx-auto max-w-5xl">{content}</div>
        </main>

        <form onSubmit={send} className="border-t border-line bg-bg p-3 md:px-6">
          <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 focus-within:border-accent">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Converse com a IA…"
              aria-label="Mensagem para a IA"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm placeholder:text-muted/70 focus:outline-none"
            />
            <IconButton label="Enviar mensagem" type="submit" disabled={!draft.trim()} className="text-accent disabled:opacity-40"><SendHorizontal className="size-4" /></IconButton>
          </div>
        </form>
      </div>

      <SubjectDialog
        open={dialog.open}
        subject={dialog.subject}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
        onSaved={(s) => { if (!dialog.subject) navigate({ kind: "subject", id: s.id }); }}
      />
    </div>
  );
}
