"use client";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, Pencil, Play, Plus, Sparkles, Trash2, XCircle } from "lucide-react";
import { z } from "zod";
import { db } from "@/lib/db";
import { deleteQuiz, recordAttempt, saveQuiz, type QuizDraft } from "@/lib/study-repo";
import { quizAverage } from "@/lib/stats";
import { cn } from "@/lib/cn";
import { Button, EmptyState, Field, IconButton, Input, Loading } from "./ui";
import type { Quiz, Subject } from "@/lib/schemas";
import { useGeneration } from "./generation-provider";

type Mode = { kind: "list" } | { kind: "edit"; quiz: Quiz | null } | { kind: "take"; quiz: Quiz };

export function QuizzesPanel({ subjectId }: { subjectId?: string }) {
  const quizzes = useLiveQuery(() => db.quizzes.toArray().then((a) => a.filter((q) => subjectId === undefined || q.subjectId === subjectId)), [subjectId]);
  const attempts = useLiveQuery(() => db.quizAttempts.toArray(), []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const generation = useGeneration();

  useEffect(() => {
    void generation.markKindViewed("quiz", subjectId);
  }, [generation.jobs, generation.markKindViewed, subjectId]);

  useEffect(() => {
    const target = generation.openTarget;
    if (target?.kind !== "quiz" || !quizzes) return;
    const found = quizzes.find((quiz) => quiz.id === target.contentId);
    if (!found) return;
    setMode({ kind: "take", quiz: found });
    generation.clearOpenTarget();
  }, [generation.openTarget, generation.clearOpenTarget, quizzes]);

  if (!quizzes || !attempts || !subjects) return <Loading />;
  if (mode.kind === "edit") return <Editor quiz={mode.quiz} subjectId={subjectId} subjects={subjects} onDone={() => setMode({ kind: "list" })} />;
  if (mode.kind === "take") return <Take quiz={mode.quiz} onExit={() => setMode({ kind: "list" })} />;

  return (
    <section aria-label="Quizzes" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{quizzes.length === 0 ? "Crie quizzes para testar o que você já sabe." : `Média geral de acertos: ${quizAverage(attempts.filter((a) => quizzes.some((q) => q.id === a.quizId))) ?? "—"}${quizAverage(attempts.filter((a) => quizzes.some((q) => q.id === a.quizId))) === null ? "" : "%"}`}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => generation.openDialog("quiz", subjectId)}><Sparkles className="size-4" aria-hidden /> Gerar com IA</Button>
          <Button variant="primary" onClick={() => setMode({ kind: "edit", quiz: null })}><Plus className="size-4" aria-hidden /> Novo quiz</Button>
        </div>
      </div>
      {quizzes.length === 0 ? <EmptyState title="Nenhum quiz ainda" hint="Monte perguntas de múltipla escolha com a resposta correta; o app registra seu desempenho." /> : (
        <ul className="space-y-2">
          {quizzes.map((q) => {
            const mine = attempts.filter((a) => a.quizId === q.id).sort((a, b) => a.at - b.at);
            const last = mine[mine.length - 1];
            const subj = subjects.find((s) => s.id === q.subjectId);
            return (
              <li key={q.id} className="quiz-row flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{q.title}</p>
                  <p className="text-xs text-muted">
                    {q.questions.length} pergunta(s){subjectId === undefined && subj && ` · ${subj.name}`}
                    {last ? ` · última: ${last.score}/${last.total} · média: ${quizAverage(mine)}% em ${mine.length} tentativa(s)` : " · ainda não feito"}
                  </p>
                  {mine.length > 1 && <p className="mt-1 text-xs text-muted" aria-label="Histórico de notas">Evolução: {mine.slice(-6).map((a) => `${Math.round((a.score / a.total) * 100)}%`).join(" → ")}</p>}
                </div>
                <Button onClick={() => setMode({ kind: "take", quiz: q })}><Play className="size-4" aria-hidden /> Fazer</Button>
                <IconButton label={`Editar quiz ${q.title}`} onClick={() => setMode({ kind: "edit", quiz: q })}><Pencil className="size-4" /></IconButton>
                <IconButton label={`Excluir quiz ${q.title}`} onClick={() => { if (window.confirm(`Excluir o quiz "${q.title}" e o histórico de tentativas?`)) void deleteQuiz(q.id); }}><Trash2 className="size-4" /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type DraftQ = { prompt: string; options: string[]; answer: number };
const blankQ = (): DraftQ => ({ prompt: "", options: ["", ""], answer: 0 });

function Editor({ quiz, subjectId, subjects, onDone }: { quiz: Quiz | null; subjectId?: string; subjects: Subject[]; onDone: () => void }) {
  const [title, setTitle] = useState(quiz?.title ?? "");
  const [target, setTarget] = useState(quiz?.subjectId ?? "");
  const [qs, setQs] = useState<DraftQ[]>(quiz ? quiz.questions.map(({ prompt, options, answer }) => ({ prompt, options: [...options], answer })) : [blankQ()]);
  const [err, setErr] = useState<string | null>(null);
  const upd = (i: number, patch: Partial<DraftQ>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const draft: QuizDraft = { title, subjectId: subjectId ?? (target || null), questions: qs };
    try { await saveQuiz(draft, quiz ?? undefined); onDone(); }
    catch (er) { setErr(er instanceof z.ZodError ? er.issues[0]?.message ?? "Verifique os campos." : "Não foi possível salvar o quiz."); }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <h2 className="text-base font-semibold">{quiz ? "Editar quiz" : "Novo quiz"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></Field>
        {subjectId === undefined && (
          <Field label="Disciplina"><select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"><option value="">Sem disciplina</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        )}
      </div>
      {qs.map((q, i) => (
        <fieldset key={i} className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <legend className="px-1 text-xs font-medium text-muted">Pergunta {i + 1}</legend>
          <Input value={q.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} maxLength={2000} placeholder="Enunciado" aria-label={`Enunciado da pergunta ${i + 1}`} />
          {q.options.map((o, k) => (
            <div key={k} className="flex items-center gap-2">
              <input type="radio" name={`ans-${i}`} checked={q.answer === k} onChange={() => upd(i, { answer: k })} aria-label={`Marcar alternativa ${k + 1} da pergunta ${i + 1} como correta`} className="accent-[var(--accent)]" />
              <Input value={o} onChange={(e) => upd(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} maxLength={500} placeholder={`Alternativa ${k + 1}`} aria-label={`Alternativa ${k + 1} da pergunta ${i + 1}`} />
              {q.options.length > 2 && <IconButton type="button" label={`Remover alternativa ${k + 1}`} onClick={() => upd(i, { options: q.options.filter((_, m) => m !== k), answer: q.answer === k ? 0 : q.answer > k ? q.answer - 1 : q.answer })}><Trash2 className="size-4" /></IconButton>}
            </div>
          ))}
          <div className="flex gap-2">
            {q.options.length < 6 && <Button type="button" variant="ghost" onClick={() => upd(i, { options: [...q.options, ""] })}>+ Alternativa</Button>}
            {qs.length > 1 && <Button type="button" variant="ghost" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Remover pergunta</Button>}
          </div>
        </fieldset>
      ))}
      <Button type="button" onClick={() => setQs([...qs, blankQ()])}><Plus className="size-4" aria-hidden /> Adicionar pergunta</Button>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex gap-2"><Button type="submit" variant="primary">Salvar quiz</Button><Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button></div>
    </form>
  );
}

function Take({ quiz, onExit }: { quiz: Quiz; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const q = quiz.questions[i];

  async function next() {
    const all = [...answers, picked ?? -1];
    setAnswers(all);
    if (i + 1 < quiz.questions.length) { setI(i + 1); setPicked(null); setConfirmed(false); return; }
    const score = all.filter((a, k) => a === quiz.questions[k].answer).length;
    await recordAttempt(quiz, score); // registrado uma única vez, ao concluir
    setFinished(true);
  }

  if (finished) {
    const score = answers.filter((a, k) => a === quiz.questions[k].answer).length;
    return (
      <div className="fade-in space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-sm text-muted">Resultado</p>
          <p className="text-4xl font-semibold tabular-nums" data-testid="score">{score}/{quiz.questions.length}</p>
          <p className="text-sm text-muted">{Math.round((score / quiz.questions.length) * 100)}% de acertos</p>
        </div>
        <ul className="space-y-2">
          {quiz.questions.map((qq, k) => {
            const ok = answers[k] === qq.answer;
            return (
              <li key={qq.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                <p className="flex items-start gap-2">{ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Acertou" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Errou" />}<span>{qq.prompt}</span></p>
                {!ok && <p className="mt-1 pl-6 text-xs text-muted">Sua resposta: {answers[k] >= 0 ? qq.options[answers[k]] : "(em branco)"} · Correta: <span className="text-success">{qq.options[qq.answer]}</span></p>}
              </li>
            );
          })}
        </ul>
        <Button variant="primary" onClick={onExit}>Voltar aos quizzes</Button>
      </div>
    );
  }

  return (
    <div className="fade-in mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm text-muted"><span>{quiz.title} · pergunta {i + 1} de {quiz.questions.length}</span><Button variant="ghost" onClick={onExit}>Sair</Button></div>
      <fieldset className="space-y-2 rounded-2xl border border-line bg-surface p-5">
        <legend className="sr-only">Pergunta</legend>
        <p className="mb-3 text-base">{q.prompt}</p>
        {q.options.map((o, k) => {
          const isRight = confirmed && k === q.answer;
          const isWrong = confirmed && picked === k && k !== q.answer;
          return (
            <label key={k} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors", picked === k ? "border-accent bg-accent/10" : "border-line hover:bg-surface-2", isRight && "border-success bg-success/10", isWrong && "border-danger bg-danger/10")}>
              <input type="radio" name="opt" disabled={confirmed} checked={picked === k} onChange={() => setPicked(k)} className="accent-[var(--accent)]" />
              <span className="flex-1">{o}</span>
              {isRight && <CheckCircle2 className="size-4 text-success" aria-label="Correta" />}{isWrong && <XCircle className="size-4 text-danger" aria-label="Incorreta" />}
            </label>
          );
        })}
      </fieldset>
      {!confirmed ? <Button variant="primary" disabled={picked === null} onClick={() => setConfirmed(true)}>Confirmar</Button>
        : <Button variant="primary" onClick={next}>{i + 1 < quiz.questions.length ? "Próxima" : "Ver resultado"}</Button>}
    </div>
  );
}
