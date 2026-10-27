"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, GraduationCap, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { createTask, deleteTask, toggleTask } from "@/lib/repo";
import { dateInputToMs, formatDay, isOverdue } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, EmptyState, IconButton, Input, Loading } from "./ui";

/** subjectId: string = tarefas da disciplina; undefined = todas. */
export function TasksPanel({ subjectId }: { subjectId?: string }) {
  const tasks = useLiveQuery(
    () => db.tasks.toArray().then((all) => all.filter((t) => subjectId === undefined || t.subjectId === subjectId)),
    [subjectId],
  );
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"tarefa" | "avaliacao">("tarefa");
  const [due, setDue] = useState("");
  const [target, setTarget] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string | null) => subjects?.find((s) => s.id === id);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createTask({ title, kind, dueAt: dateInputToMs(due), subjectId: subjectId ?? (target || null) });
      setTitle("");
      setDue("");
    } catch {
      setError("Informe um título para continuar.");
    }
  }

  const sorted = tasks?.slice().sort((a, b) => Number(a.done) - Number(b.done) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.createdAt - b.createdAt);

  return (
    <section aria-label="Tarefas e avaliações" className="space-y-4">
      <form onSubmit={add} className="space-y-2 rounded-xl border border-line bg-surface p-3">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-48 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa ou avaliação" aria-label="Título" maxLength={200} />
          <select aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as "tarefa" | "avaliacao")} className="rounded-lg border border-line bg-surface px-2 py-2 text-sm">
            <option value="tarefa">Tarefa</option>
            <option value="avaliacao">Avaliação</option>
          </select>
          <Input type="date" aria-label="Prazo" value={due} onChange={(e) => setDue(e.target.value)} className="w-auto" />
          {subjectId === undefined && (
            <select aria-label="Disciplina" value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-2 text-sm">
              <option value="">Sem disciplina</option>
              {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <Button type="submit" variant="primary">Adicionar</Button>
        </div>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </form>

      {sorted === undefined ? <Loading /> : sorted.length === 0 ? (
        <EmptyState title="Nada por aqui ainda" hint="Adicione tarefas e datas de avaliação para acompanhar seus prazos." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {sorted.map((t) => {
            const subj = nameOf(t.subjectId);
            return (
              <li key={t.id} className="fade-in flex items-center gap-3 px-3 py-2.5">
                <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} aria-label={`Concluir ${t.title}`} className="size-4 accent-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm", t.done && "text-muted line-through")}>{t.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                    {t.kind === "avaliacao" && <span className="inline-flex items-center gap-1 text-warning"><GraduationCap className="size-3" aria-hidden /> Avaliação</span>}
                    {t.dueAt !== null && (
                      <span className={cn("inline-flex items-center gap-1", isOverdue(t.dueAt, t.done) && "text-danger")}>
                        <CalendarDays className="size-3" aria-hidden /> {formatDay(t.dueAt)}{isOverdue(t.dueAt, t.done) && " · atrasada"}
                      </span>
                    )}
                    {subj && subjectId === undefined && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: subj.color }} aria-hidden />{subj.name}</span>}
                  </p>
                </div>
                <IconButton label={`Excluir ${t.title}`} onClick={() => deleteTask(t.id)}><Trash2 className="size-4" /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
