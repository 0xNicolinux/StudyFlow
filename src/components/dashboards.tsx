"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, GraduationCap } from "lucide-react";
import { db } from "@/lib/db";
import { formatDay, isOverdue } from "@/lib/format";
import { cn } from "@/lib/cn";
import { updateSubject } from "@/lib/repo";
import { dueCount, formatDuration, quizAverage, retention, sessionsSince, totalSeconds } from "@/lib/stats";
import { rankPanels, suggest, type PanelId, type Suggestion } from "@/lib/adaptive";
import { EmptyState, Loading } from "./ui";
import { Suggestions } from "./suggestions";
import { trackPanel, useAdaptive } from "./use-adaptive";
import { TasksPanel } from "./tasks-panel";
import { NotesPanel } from "./notes-panel";
import { FlashcardsPanel } from "./flashcards-panel";
import { QuizzesPanel } from "./quizzes-panel";
import { LibraryPanel } from "./library-panel";
import { Button } from "./ui";
import { useNow } from "./use-now";
import { useState, type ReactNode } from "react";
import type { Subject, Task } from "@/lib/schemas";
import type { View } from "./app-shell";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export type SubjectTab = "geral" | "tarefas" | "anotacoes" | "flashcards" | "quizzes" | "materiais";
// Cada aba de disciplina corresponde a um painel global; é assim que o uso dentro e fora das disciplinas se soma.
export const TAB_PANEL: Partial<Record<SubjectTab, PanelId>> = { tarefas: "tasks", anotacoes: "notes", flashcards: "flashcards", quizzes: "quizzes", materiais: "library" };
const PANEL_TAB: Partial<Record<PanelId, SubjectTab>> = { tasks: "tarefas", notes: "anotacoes", flashcards: "flashcards", quizzes: "quizzes", library: "materiais" };

/** Destino de uma sugestão: abre a aba da disciplina quando há uma, ou o painel global. */
function suggestionView(s: Suggestion): View {
  if (s.panel === "focus") return { kind: "focus" };
  if (s.subjectId) return { kind: "subject", id: s.subjectId, tab: s.panel ? PANEL_TAB[s.panel] : undefined };
  return { kind: s.panel ?? "home" };
}

const pct = (tasks: Task[]) => (tasks.length ? Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100) : 0);

export function HomeDashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const sessions = useLiveQuery(() => db.studySessions.toArray(), []);
  const cards = useLiveQuery(() => db.flashcards.toArray(), []);
  const attempts = useLiveQuery(() => db.quizAttempts.toArray(), []);
  const quizzes = useLiveQuery(() => db.quizzes.toArray(), []);
  const adaptive = useAdaptive();
  const now = useNow(60_000);
  if (!tasks || !subjects || !sessions || !cards || !attempts || !quizzes) return <Loading />;

  const open = tasks.filter((t) => !t.done).sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
  const exams = open.filter((t) => t.kind === "avaliacao" && t.dueAt !== null).slice(0, 4);
  const upcoming = open.slice(0, 5);
  const subj = (id: string | null) => subjects.find((s) => s.id === id);

  if (subjects.length === 0 && tasks.length === 0) {
    return <EmptyState title="Bem-vindo ao StudyFlow" hint="Comece criando uma disciplina no menu lateral (no celular, toque em ☰). Seus dados ficam apenas neste dispositivo." />;
  }

  return (
    <div className="fade-in space-y-6">
      <Suggestions items={suggest({ now, subjects, tasks, cards, quizzes, sessions, adaptive })} onAct={(sg) => onNavigate(suggestionView(sg))} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {/* Os quatro indicadores ligados a painéis ocupam as mesmas posições de sempre, na ordem de uso. */}
        {(() => {
          const bound: Record<"tasks" | "focus" | "flashcards" | "quizzes", ReactNode> = {
            tasks: <Stat key="tasks" label="Tarefas em aberto" value={String(open.length)} />,
            focus: <Stat key="focus" label="Estudo hoje" value={formatDuration(totalSeconds(sessionsSince(sessions, 1, now)))} hint={`${formatDuration(totalSeconds(sessionsSince(sessions, 7, now)))} nos últimos 7 dias`} />,
            flashcards: (
              <button key="flashcards" onClick={() => onNavigate({ kind: "flashcards" })} className="rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-2">
                <p className="text-xs text-muted">Revisões pendentes</p><p className="mt-1 text-2xl font-semibold tabular-nums">{dueCount(cards, now)}</p><p className="mt-0.5 text-xs text-muted">{cards.length} cartões no total</p>
              </button>
            ),
            quizzes: <Stat key="quizzes" label="Média nos quizzes" value={quizAverage(attempts) === null ? "—" : `${quizAverage(attempts)}%`} hint={attempts.length ? `${attempts.length} tentativa(s)` : "Nenhuma tentativa ainda"} />,
          };
          const [a, b, c, d] = rankPanels(["tasks", "focus", "flashcards", "quizzes"] as const, adaptive.panels, now);
          return [
            <Stat key="subjects" label="Disciplinas" value={String(subjects.length)} />,
            bound[a],
            <Stat key="progress" label="Progresso geral" value={`${pct(tasks)}%`} hint={`${tasks.filter((t) => t.done).length} de ${tasks.length} concluídas`} />,
            bound[b], bound[c], bound[d],
          ];
        })()}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="up" className="space-y-2">
          <h2 id="up" className="text-sm font-semibold">Próximas tarefas</h2>
          {upcoming.length === 0 ? <p className="text-sm text-muted">Nenhuma tarefa em aberto.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {upcoming.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="truncate">{t.title}</span>
                  <span className={cn("flex shrink-0 items-center gap-1 text-xs", isOverdue(t.dueAt, t.done) ? "text-danger" : "text-muted")}>
                    {t.dueAt !== null && <><CalendarDays className="size-3" aria-hidden />{formatDay(t.dueAt)}</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ex" className="space-y-2">
          <h2 id="ex" className="text-sm font-semibold">Avaliações</h2>
          {exams.length === 0 ? <p className="text-sm text-muted">Nenhuma avaliação com data marcada.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {exams.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><GraduationCap className="size-4 shrink-0 text-warning" aria-hidden /><span className="truncate">{t.title}</span></span>
                  <span className="shrink-0 text-xs text-muted">{subj(t.subjectId)?.name} · {formatDay(t.dueAt!)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {subjects.length > 0 && (
        <section aria-labelledby="sj" className="space-y-2">
          <h2 id="sj" className="text-sm font-semibold">Progresso por disciplina</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {subjects.map((s) => {
              const own = tasks.filter((t) => t.subjectId === s.id);
              return (
                <li key={s.id}>
                  <button onClick={() => onNavigate({ kind: "subject", id: s.id })} className="w-full rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-2">
                    <span className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />{s.name}</span><span className="tabular-nums text-muted">{pct(own)}%</span></span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full" style={{ width: `${pct(own)}%`, background: s.color }} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

type Tab = SubjectTab;
const TAB_LABEL: Record<Tab, string> = { geral: "Visão geral", tarefas: "Tarefas", anotacoes: "Anotações", flashcards: "Flashcards", quizzes: "Quizzes", materiais: "Materiais" };
const TAB_DEFAULT: Exclude<Tab, "geral">[] = ["tarefas", "anotacoes", "flashcards", "quizzes", "materiais"];

export function SubjectDashboard({ subject, initialTab, onNavigate }: { subject: Subject; initialTab?: Tab; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "geral");
  const adaptive = useAdaptive();
  const now = useNow(60_000);
  // A ordem das abas é decidida ao abrir a disciplina e não muda enquanto ela está aberta (nada se move sob o cursor).
  const [tabs] = useState<Tab[]>(() => {
    const ranked = rankPanels(TAB_DEFAULT.map((t) => TAB_PANEL[t]!), adaptive.subjects[subject.id]?.panels ?? {}, now);
    return ["geral", ...ranked.map((p) => PANEL_TAB[p]!)];
  });
  function select(t: Tab) {
    setTab(t);
    const panel = TAB_PANEL[t];
    if (panel) trackPanel(panel, subject.id);
  }
  return (
    <div className="fade-in space-y-5">
      <div role="tablist" aria-label={`Seções de ${subject.name}`} className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((id) => (
          <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls="subject-panel" onClick={() => select(id)}
            className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors", tab === id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>{TAB_LABEL[id]}</button>
        ))}
      </div>
      <div role="tabpanel" id="subject-panel" aria-labelledby={`tab-${tab}`}>
        {tab === "geral" && <Overview subject={subject} onTab={select} onNavigate={onNavigate} />}
        {tab === "tarefas" && <TasksPanel subjectId={subject.id} />}
        {tab === "anotacoes" && <NotesPanel subjectId={subject.id} />}
        {tab === "flashcards" && <FlashcardsPanel subjectId={subject.id} />}
        {tab === "quizzes" && <QuizzesPanel subjectId={subject.id} />}
        {tab === "materiais" && <LibraryPanel subjectId={subject.id} />}
      </div>
    </div>
  );
}

function Overview({ subject, onTab, onNavigate }: { subject: Subject; onTab: (t: Tab) => void; onNavigate: (v: View) => void }) {
  const act = (sg: Suggestion) => {
    if (sg.panel === "focus") onNavigate({ kind: "focus" });
    else if (sg.panel && PANEL_TAB[sg.panel]) onTab(PANEL_TAB[sg.panel]!);
  };
  const id = subject.id;
  const tasks = useLiveQuery(() => db.tasks.where("subjectId").equals(id).toArray(), [id]);
  const noteCount = useLiveQuery(() => db.notes.where("subjectId").equals(id).count(), [id]);
  const sessions = useLiveQuery(() => db.studySessions.where("subjectId").equals(id).toArray(), [id]);
  const cards = useLiveQuery(() => db.flashcards.where("subjectId").equals(id).toArray(), [id]);
  const attempts = useLiveQuery(() => db.quizAttempts.where("subjectId").equals(id).toArray(), [id]);
  const docCount = useLiveQuery(() => db.documents.where("subjectId").equals(id).count(), [id]);
  const quizzes = useLiveQuery(() => db.quizzes.where("subjectId").equals(id).toArray(), [id]);
  const adaptive = useAdaptive();
  const now = useNow(60_000);
  if (!tasks || !sessions || !cards || !attempts || !quizzes) return <Loading />;
  const due = dueCount(cards, now);
  const avg = quizAverage(attempts);
  const ret = retention(cards);
  return (
    <div className="space-y-6">
      <Suggestions items={suggest({ now, scope: id, subjects: [subject], tasks, cards, quizzes, sessions, adaptive })} onAct={act} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Progresso" value={`${pct(tasks)}%`} hint={`${tasks.filter((t) => !t.done).length} tarefa(s) em aberto`} />
        <Stat label="Tempo de estudo" value={formatDuration(totalSeconds(sessions))} hint={`${sessions.length} sessão(ões) de foco`} />
        <Stat label="Média nos quizzes" value={avg === null ? "—" : `${avg}%`} hint={attempts.length ? `${attempts.length} tentativa(s)` : "Nenhuma tentativa ainda"} />
        <Stat label="Acertos nas revisões" value={ret === null ? "—" : `${ret}%`} hint={cards.length ? `${cards.length} cartão(ões)` : "Sem cartões ainda"} />
        <Stat label="Anotações" value={noteCount === undefined ? "—" : String(noteCount)} />
        <Stat label="Materiais" value={docCount === undefined ? "—" : String(docCount)} />
      </div>
      <section aria-labelledby="rev" className="space-y-2">
        <h2 id="rev" className="text-sm font-semibold">Revisões</h2>
        {cards.length === 0 ? <p className="text-sm text-muted">Crie flashcards para receber revisões agendadas.</p>
          : due === 0 ? <p className="text-sm text-muted">Nenhuma revisão pendente agora.</p>
          : <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 text-sm"><span>{due} cartão(ões) para revisar.</span><Button variant="primary" onClick={() => onTab("flashcards")}>Revisar agora</Button></div>}
      </section>
      <GoalsEditor key={subject.id} subject={subject} />
    </div>
  );
}

function GoalsEditor({ subject }: { subject: Subject }) {
  return (
    <section aria-labelledby="goals" className="space-y-2">
      <h2 id="goals" className="text-sm font-semibold">Objetivos</h2>
      <textarea
        defaultValue={subject.goals}
        onBlur={(e) => { if (e.target.value !== subject.goals) void updateSubject(subject.id, { goals: e.target.value }); }}
        placeholder="O que você quer alcançar nesta disciplina?"
        aria-labelledby="goals"
        className="min-h-24 w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm focus:border-accent focus:outline-none"
      />
    </section>
  );
}
