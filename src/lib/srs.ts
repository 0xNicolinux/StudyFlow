import type { Flashcard } from "./schemas";

export type Grade = 0 | 1 | 2 | 3; // Errei, Difícil, Bom, Fácil
export const GRADE_LABELS = ["Errei", "Difícil", "Bom", "Fácil"] as const;

const DAY = 86_400_000;
const RELEARN_MS = 10 * 60_000;
const clampEase = (e: number) => Math.min(3, Math.max(1.3, e));

/** Agendamento tipo SM-2 simplificado. Função pura: devolve apenas o que muda no cartão. */
export function schedule(card: Pick<Flashcard, "intervalDays" | "ease" | "correct" | "wrong">, grade: Grade, now: number) {
  if (grade === 0) {
    return { intervalDays: 0, ease: clampEase(card.ease - 0.2), wrong: card.wrong + 1, correct: card.correct, dueAt: now + RELEARN_MS };
  }
  let interval: number;
  let ease = card.ease;
  if (card.intervalDays === 0) {
    interval = grade === 3 ? 4 : 1; // cartão novo ou recém-errado
  } else if (grade === 1) {
    interval = Math.max(card.intervalDays + 1, Math.round(card.intervalDays * 1.2));
    ease = clampEase(ease - 0.15);
  } else if (grade === 2) {
    interval = Math.max(card.intervalDays + 1, Math.round(card.intervalDays * ease));
  } else {
    interval = Math.max(card.intervalDays + 2, Math.round(card.intervalDays * ease * 1.3));
    ease = clampEase(ease + 0.15);
  }
  return { intervalDays: interval, ease, correct: card.correct + 1, wrong: card.wrong, dueAt: now + interval * DAY };
}

/** Prévia legível do próximo intervalo, para mostrar nos botões de avaliação. */
export function previewLabel(card: Pick<Flashcard, "intervalDays" | "ease" | "correct" | "wrong">, grade: Grade) {
  const r = schedule(card, grade, 0);
  return r.intervalDays === 0 ? "10 min" : r.intervalDays === 1 ? "1 dia" : `${r.intervalDays} dias`;
}

export const isDue = (c: Pick<Flashcard, "dueAt">, now: number) => c.dueAt <= now;
