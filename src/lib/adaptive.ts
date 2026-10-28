import { z } from "zod";
import { createLocalStore } from "./local-store";
import { DAY_MS } from "./stats";
import type { Flashcard, Quiz, StudySession, Subject, Task } from "./schemas";

/* ---------- Estado ---------- */
// Painéis que podem ser reordenados pela atividade (os mesmos do menu lateral e das abas de cada disciplina).
export const PANELS = ["tasks", "notes", "focus", "flashcards", "quizzes", "library"] as const;
export type PanelId = (typeof PANELS)[number];

// Contador com decaimento exponencial: `n` já considera o passado até `last`; visitas antigas pesam cada vez menos.
const UseSchema = z.object({ n: z.number().min(0), last: z.number() });
const PanelUseSchema = z.partialRecord(z.enum(PANELS), UseSchema);

export const AdaptiveSchema = z.object({
  panels: PanelUseSchema.default({}),
  subjects: z.record(z.string(), z.object({ n: z.number().min(0), last: z.number(), panels: PanelUseSchema.default({}) })).default({}),
});
export type AdaptiveState = z.infer<typeof AdaptiveSchema>;
type Use = z.infer<typeof UseSchema>;

export const EMPTY_ADAPTIVE: AdaptiveState = AdaptiveSchema.parse({});

/** Só mede o que o usuário faz neste dispositivo; nunca sai dele. */
export const adaptiveStore = createLocalStore<AdaptiveState>("studyflow.adaptive.v1", (raw) => {
  const r = AdaptiveSchema.safeParse(raw ?? {});
  return r.success ? r.data : EMPTY_ADAPTIVE;
});

/* ---------- Pontuação ---------- */
export const HALF_LIFE_MS = 14 * DAY_MS;
/** Abaixo disso não há evidência suficiente: a ordem padrão é mantida (evita embaralhar o menu nas primeiras visitas). */
export const MIN_EVIDENCE = 4;

const decay = (dt: number) => Math.pow(0.5, Math.max(0, dt) / HALF_LIFE_MS);
export const scoreOf = (u: Use | undefined, now: number) => (u ? u.n * decay(now - u.last) : 0);
const bump = (u: Use | undefined, now: number): Use => ({ n: scoreOf(u, now) + 1, last: now });

/* ---------- Registro de atividade (funções puras) ---------- */
/** Uso de um painel; se vier de dentro de uma disciplina, também conta para ela. */
export function recordPanel(s: AdaptiveState, panel: PanelId, now: number, subjectId?: string | null): AdaptiveState {
  const next: AdaptiveState = { ...s, panels: { ...s.panels, [panel]: bump(s.panels[panel], now) } };
  if (subjectId) {
    const sub = s.subjects[subjectId] ?? { n: 0, last: now, panels: {} };
    next.subjects = { ...s.subjects, [subjectId]: { ...sub, panels: { ...sub.panels, [panel]: bump(sub.panels[panel], now) } } };
  }
  return next;
}

export function recordSubject(s: AdaptiveState, subjectId: string, now: number): AdaptiveState {
  const sub = s.subjects[subjectId] ?? { n: 0, last: now, panels: {} };
  return { ...s, subjects: { ...s.subjects, [subjectId]: { ...sub, n: scoreOf(sub, now) + 1, last: now } } };
}

export function forgetSubject(s: AdaptiveState, subjectId: string): AdaptiveState {
  const { [subjectId]: _removed, ...rest } = s.subjects;
  void _removed;
  return { ...s, subjects: rest };
}

/* ---------- Ordem ---------- */
/** Reordena por uso recente; empates e itens nunca usados seguem a ordem padrão. */
export function rankPanels<T extends PanelId>(order: readonly T[], uses: Partial<Record<PanelId, Use>>, now: number): T[] {
  const scores = new Map(order.map((p) => [p, scoreOf(uses[p], now)] as const));
  const total = [...scores.values()].reduce((a, b) => a + b, 0);
  if (total < MIN_EVIDENCE) return [...order];
  return [...order].sort((a, b) => scores.get(b)! - scores.get(a)! || order.indexOf(a) - order.indexOf(b));
}

export function lastSubjectId(s: AdaptiveState, existing: readonly string[]): string | null {
  let best: string | null = null;
  for (const id of existing) {
    const u = s.subjects[id];
    if (u && u.n > 0 && (best === null || u.last > s.subjects[best].last)) best = id;
  }
  return best;
}

/* ---------- Cores ---------- */
/** Cor da paleta menos usada pelas disciplinas existentes (empate: a primeira da paleta). */
export function leastUsedColor(palette: readonly string[], used: readonly string[]): string {
  const count = (c: string) => used.filter((u) => u.toLowerCase() === c.toLowerCase()).length;
  return palette.reduce((best, c) => (count(c) < count(best) ? c : best), palette[0]);
}

const lin = (v: number) => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const luminance = (hex: string) => 0.2126 * lin(parseInt(hex.slice(1, 3), 16)) + 0.7152 * lin(parseInt(hex.slice(3, 5), 16)) + 0.0722 * lin(parseInt(hex.slice(5, 7), 16));
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Cor de texto legível sobre a cor da disciplina (usada nos botões primários). */
export function readableOn(bg: string, dark = "#14121f", light = "#ffffff"): string {
  return contrast(bg, dark) >= contrast(bg, light) ? dark : light;
}

/* ---------- Sugestões contextuais ---------- */
export type Suggestion = { id: string; text: string; action: string; panel: PanelId | null; subjectId: string | null; priority: number };

export type SuggestInput = {
  now: number;
  subjects: Pick<Subject, "id" | "name">[];
  tasks: Pick<Task, "subjectId" | "title" | "kind" | "dueAt" | "done">[];
  cards: Pick<Flashcard, "subjectId" | "dueAt">[];
  quizzes: Pick<Quiz, "subjectId">[];
  sessions: Pick<StudySession, "subjectId" | "startedAt">[];
  adaptive: AdaptiveState;
  /** Se informado, considera só os dados dessa disciplina. */
  scope?: string;
  limit?: number;
};

const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const when = (days: number) => (days <= 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`);

export function suggest(input: SuggestInput): Suggestion[] {
  const { now, scope, adaptive } = input;
  const inScope = <T extends { subjectId: string | null }>(xs: T[]) => (scope ? xs.filter((x) => x.subjectId === scope) : xs);
  const tasks = inScope(input.tasks).filter((t) => !t.done);
  const cards = inScope(input.cards);
  const sessions = inScope(input.sessions);
  const name = (id: string | null) => input.subjects.find((s) => s.id === id)?.name;
  // Painéis que o usuário mais usa ganham um impulso (até 15 pontos) sobre a prioridade base: quem vive de flashcards vê as revisões antes.
  const uses = scope ? (adaptive.subjects[scope]?.panels ?? {}) : adaptive.panels;
  const boost = (p: PanelId) => Math.min(15, scoreOf(uses[p], now));
  const out: Suggestion[] = [];
  const today = startOfDay(now);

  const overdue = tasks.filter((t) => t.dueAt !== null && t.dueAt < today);
  if (overdue.length) out.push({ id: "overdue", text: `Você tem ${plural(overdue.length, "tarefa atrasada", "tarefas atrasadas")}.`, action: "Ver tarefas", panel: "tasks", subjectId: scope ?? null, priority: 100 + boost("tasks") });

  const exam = tasks.filter((t) => t.kind === "avaliacao" && t.dueAt !== null && t.dueAt >= today && t.dueAt <= today + 7 * DAY_MS).sort((a, b) => a.dueAt! - b.dueAt!)[0];
  if (exam) {
    const days = Math.round((startOfDay(exam.dueAt!) - today) / DAY_MS);
    const hasQuiz = input.quizzes.some((q) => q.subjectId === exam.subjectId);
    const subject = name(exam.subjectId);
    out.push({
      id: "exam",
      text: `“${exam.title}” é ${when(days)}. ${hasQuiz ? "Refaça um quiz" : "Monte um quiz"}${subject && !scope ? ` de ${subject}` : ""} para treinar.`,
      action: hasQuiz ? "Praticar" : "Criar quiz", panel: "quizzes", subjectId: exam.subjectId, priority: 90 + boost("quizzes"),
    });
  }

  // Dentro de uma disciplina a seção "Revisões" da visão geral já cumpre esse papel; sugerir de novo seria repetição.
  const due = scope ? 0 : cards.filter((c) => c.dueAt <= now).length;
  if (due) out.push({ id: "cards", text: `${plural(due, "cartão pronto", "cartões prontos")} para revisar.`, action: "Revisar", panel: "flashcards", subjectId: null, priority: 80 + boost("flashcards") });

  if (!scope) {
    const last = lastSubjectId(adaptive, input.subjects.map((s) => s.id));
    if (last) out.push({ id: "resume", text: `Continue de onde parou: ${name(last)}.`, action: "Abrir", panel: null, subjectId: last, priority: 50 });
  }

  // Só sugere foco a quem já usa o recurso e ainda não estudou hoje, tendo o que estudar.
  const hasHabit = sessions.length > 0;
  const studiedToday = sessions.some((s) => s.startedAt >= today);
  if (hasHabit && !studiedToday && (tasks.length > 0 || cards.length > 0)) {
    out.push({ id: "focus", text: "Nenhum estudo registrado hoje. Que tal uma sessão de foco?", action: "Iniciar foco", panel: "focus", subjectId: null, priority: 40 + boost("focus") });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, input.limit ?? 3);
}
