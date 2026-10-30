import { db } from "./db";
import { schedule, type Grade } from "./srs";
import { FlashcardSchema, QuizAttemptSchema, QuizSchema, StudySessionSchema, type Flashcard, type Quiz, type QuizQuestion } from "./schemas";

const uid = () => crypto.randomUUID();

/* ---------- Sessões de estudo ---------- */
export async function recordSession(input: { subjectId: string | null; startedAt: number; seconds: number }) {
  await db.studySessions.add(StudySessionSchema.parse({ id: uid(), ...input }));
}

/* ---------- Flashcards ---------- */
export async function createFlashcard(input: { subjectId: string | null; front: string; back: string }): Promise<Flashcard> {
  const now = Date.now();
  const card = FlashcardSchema.parse({ id: uid(), subjectId: input.subjectId, front: input.front, back: input.back, createdAt: now, dueAt: 0, intervalDays: 0, ease: 2.5, correct: 0, wrong: 0 });
  await db.flashcards.add(card);
  return card;
}

/** Persiste um lote inteiro de cartões em uma transação; nenhum cartão parcial é mantido. */
export async function createFlashcardsBatch(input: {
  subjectId: string | null;
  cards: { front: string; back: string }[];
}): Promise<Flashcard[]> {
  const now = Date.now();
  const cards = input.cards.map(({ front, back }) => FlashcardSchema.parse({
    id: uid(),
    subjectId: input.subjectId,
    front,
    back,
    createdAt: now,
    dueAt: 0,
    intervalDays: 0,
    ease: 2.5,
    correct: 0,
    wrong: 0,
  }));
  await db.transaction("rw", db.flashcards, () => db.flashcards.bulkAdd(cards));
  return cards;
}

export async function updateFlashcard(id: string, patch: { front: string; back: string }) {
  const c = await db.flashcards.get(id);
  if (!c) throw new Error("Cartão não encontrado");
  await db.flashcards.put(FlashcardSchema.parse({ ...c, ...patch }));
}

export const deleteFlashcard = (id: string) => db.flashcards.delete(id);

export async function reviewFlashcard(id: string, grade: Grade, now = Date.now()) {
  const c = await db.flashcards.get(id);
  if (!c) return;
  await db.flashcards.update(id, schedule(c, grade, now));
}

/* ---------- Quizzes ---------- */
export type QuizDraft = { title: string; subjectId: string | null; questions: Omit<QuizQuestion, "id">[] };

export async function saveQuiz(draft: QuizDraft, existing?: Quiz): Promise<Quiz> {
  const quiz = QuizSchema.parse({
    id: existing?.id ?? uid(), subjectId: draft.subjectId, title: draft.title, createdAt: existing?.createdAt ?? Date.now(),
    questions: draft.questions.map((q) => ({ ...q, id: uid() })),
  });
  await db.quizzes.put(quiz);
  return quiz;
}

export async function deleteQuiz(id: string) {
  await db.transaction("rw", db.quizzes, db.quizAttempts, async () => {
    await db.quizAttempts.where("quizId").equals(id).delete();
    await db.quizzes.delete(id);
  });
}

export async function recordAttempt(quiz: Quiz, score: number) {
  await db.quizAttempts.add(QuizAttemptSchema.parse({ id: uid(), quizId: quiz.id, subjectId: quiz.subjectId, score, total: quiz.questions.length, at: Date.now() }));
}
