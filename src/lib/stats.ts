import type { Flashcard, QuizAttempt, StudySession } from "./schemas";

export const DAY_MS = 86_400_000;

export const totalSeconds = (sessions: Pick<StudySession, "seconds">[]) => sessions.reduce((n, s) => n + s.seconds, 0);

/** Sessões iniciadas nos últimos `days` dias (incluindo hoje). */
export function sessionsSince(sessions: StudySession[], days: number, now: number) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const from = start.getTime() - (days - 1) * DAY_MS;
  return sessions.filter((s) => s.startedAt >= from);
}

export function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}

/** Média de acertos (0–100) considerando todas as tentativas; null se não há tentativas. */
export function quizAverage(attempts: Pick<QuizAttempt, "score" | "total">[]) {
  if (!attempts.length) return null;
  const s = attempts.reduce((n, a) => n + a.score, 0);
  const t = attempts.reduce((n, a) => n + a.total, 0);
  return Math.round((s / t) * 100);
}

/** Taxa de acerto nas revisões de flashcards (0–100); null se nunca foram revisados. */
export function retention(cards: Pick<Flashcard, "correct" | "wrong">[]) {
  const c = cards.reduce((n, x) => n + x.correct, 0);
  const w = cards.reduce((n, x) => n + x.wrong, 0);
  return c + w === 0 ? null : Math.round((c / (c + w)) * 100);
}

export const dueCount = (cards: Pick<Flashcard, "dueAt">[], now: number) => cards.filter((c) => c.dueAt <= now).length;

/** Segundos por dia dos últimos `days` dias (mais antigo primeiro), para o gráfico de barras. */
export function secondsPerDay(sessions: StudySession[], days: number, now: number) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  return Array.from({ length: days }, (_, i) => {
    const from = t0 - (days - 1 - i) * DAY_MS;
    return { day: from, seconds: totalSeconds(sessions.filter((s) => s.startedAt >= from && s.startedAt < from + DAY_MS)) };
  });
}
