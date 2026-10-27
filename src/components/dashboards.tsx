"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, GraduationCap } from "lucide-react";
import { db } from "@/lib/db";
import { formatDay, isOverdue } from "@/lib/format";
import { cn } from "@/lib/cn";
import { updateSubject } from "@/lib/repo";
import { EmptyState, Loading } from "./ui";
import { TasksPanel } from "./tasks-panel";
import { NotesPanel } from "./notes-panel";
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

const pct = (tasks: Task[]) => (tasks.length ? Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100) : 0);

export function HomeDashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  if (!tasks || !subjects) return <Loading />;

  const open = tasks.filter((t) => !t.done).sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
  const exams = open.filter((t) => t.kind === "avaliacao" && t.dueAt !== null).slice(0, 4);
  const upcoming = open.slice(0, 5);
  const subj = (id: string | null) => subjects.find((s) => s.id === id);

  if (subjects.length === 0 && tasks.length === 0) {
    return <EmptyState title="Bem-vindo ao StudyFlow" hint="Comece criando uma disciplina na barra lateral. Seus dados ficam apenas neste dispositivo." />;
  }

  return (
    <div className="fade-in space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Disciplinas" value={String(subjects.length)} />
        <Stat label="Tarefas em aberto" value={String(open.length)} />
        <Stat label="Progresso geral" value={`${pct(tasks)}%`} hint={`${tasks.filter((t) => t.done).length} de ${tasks.length} concluídas`} />
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

export function SubjectDashboard({ subject }: { subject: Subject }) {
  const tasks = useLiveQuery(() => db.tasks.where("subjectId").equals(subject.id).toArray(), [subject.id]);
  const noteCount = useLiveQuery(() => db.notes.where("subjectId").equals(subject.id).count(), [subject.id]);
  return (
    <div className="fade-in space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Progresso" value={tasks ? `${pct(tasks)}%` : "—"} />
        <Stat label="Tarefas em aberto" value={tasks ? String(tasks.filter((t) => !t.done).length) : "—"} />
        <Stat label="Anotações" value={noteCount === undefined ? "—" : String(noteCount)} />
      </div>
      <GoalsEditor key={subject.id} subject={subject} />
      <div className="space-y-2"><h2 className="text-sm font-semibold">Tarefas e avaliações</h2><TasksPanel subjectId={subject.id} /></div>
      <div className="space-y-2"><h2 className="text-sm font-semibold">Anotações</h2><NotesPanel subjectId={subject.id} /></div>
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
