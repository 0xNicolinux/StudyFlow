import { db } from "./db";
import {
  BackupSchema,
  NoteSchema,
  ProfileSchema,
  SubjectSchema,
  TaskSchema,
  type Backup,
  type Note,
  type Profile,
  type Subject,
  type Task,
} from "./schemas";

const uid = () => crypto.randomUUID();

export const SUBJECT_COLORS = ["#8b7cf6", "#5b9cf5", "#4fc1b0", "#e8b94f", "#e98a6a", "#d47fc4"];

/* ---------- Disciplinas ---------- */
export async function createSubject(input: { name: string; color?: string; goals?: string }): Promise<Subject> {
  const now = Date.now();
  const count = await db.subjects.count();
  const subject = SubjectSchema.parse({
    id: uid(),
    name: input.name,
    color: input.color ?? SUBJECT_COLORS[count % SUBJECT_COLORS.length],
    goals: input.goals ?? "",
    createdAt: now,
    updatedAt: now,
  });
  await db.subjects.add(subject);
  return subject;
}

export async function updateSubject(id: string, patch: Partial<Pick<Subject, "name" | "color" | "goals">>) {
  const current = await db.subjects.get(id);
  if (!current) throw new Error("Disciplina não encontrada");
  const next = SubjectSchema.parse({ ...current, ...patch, updatedAt: Date.now() });
  await db.subjects.put(next);
  return next;
}

/** Exclui a disciplina e todos os seus dados em uma única transação. */
export async function deleteSubject(id: string) {
  await db.transaction("rw", db.subjects, db.tasks, db.notes, async () => {
    await db.tasks.where("subjectId").equals(id).delete();
    await db.notes.where("subjectId").equals(id).delete();
    await db.subjects.delete(id);
  });
}

/* ---------- Tarefas e avaliações ---------- */
export async function createTask(input: {
  title: string;
  subjectId: string | null;
  kind?: Task["kind"];
  dueAt?: number | null;
}): Promise<Task> {
  const task = TaskSchema.parse({
    id: uid(),
    subjectId: input.subjectId,
    title: input.title,
    kind: input.kind ?? "tarefa",
    dueAt: input.dueAt ?? null,
    done: false,
    createdAt: Date.now(),
  });
  await db.tasks.add(task);
  return task;
}

export async function toggleTask(id: string) {
  const t = await db.tasks.get(id);
  if (t) await db.tasks.update(id, { done: !t.done });
}

export const deleteTask = (id: string) => db.tasks.delete(id);

/* ---------- Anotações ---------- */
export async function createNote(input: { title: string; subjectId: string | null; body?: string }): Promise<Note> {
  const note = NoteSchema.parse({
    id: uid(),
    subjectId: input.subjectId,
    title: input.title,
    body: input.body ?? "",
    updatedAt: Date.now(),
  });
  await db.notes.add(note);
  return note;
}

export async function updateNote(id: string, patch: Partial<Pick<Note, "title" | "body">>) {
  const current = await db.notes.get(id);
  if (!current) throw new Error("Anotação não encontrada");
  const next = NoteSchema.parse({ ...current, ...patch, updatedAt: Date.now() });
  await db.notes.put(next);
  return next;
}

export const deleteNote = (id: string) => db.notes.delete(id);

/* ---------- Perfil ---------- */
export async function saveProfile(input: { name: string; photo: string | null }): Promise<Profile> {
  const profile = ProfileSchema.parse({ id: "me", ...input });
  await db.profile.put(profile);
  return profile;
}

/* ---------- Backup ---------- */
export async function exportBackup(): Promise<Backup> {
  const [subjects, tasks, notes, profile] = await Promise.all([
    db.subjects.toArray(),
    db.tasks.toArray(),
    db.notes.toArray(),
    db.profile.get("me"),
  ]);
  return { app: "studyflow", version: 1, exportedAt: Date.now(), data: { subjects, tasks, notes, profile: profile ?? null } };
}

export type ImportResult = { ok: true; counts: { subjects: number; tasks: number; notes: number } } | { ok: false; error: string };

/** Valida o arquivo inteiro antes de tocar nos dados atuais; só então substitui tudo em uma transação. */
export async function importBackup(raw: string): Promise<ImportResult> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "O arquivo não é um JSON válido." };
  }
  const parsed = BackupSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: "Arquivo de backup inválido ou de versão não suportada." };
  }
  const { subjects, tasks, notes, profile } = parsed.data.data;
  await db.transaction("rw", db.subjects, db.tasks, db.notes, db.profile, async () => {
    await Promise.all([db.subjects.clear(), db.tasks.clear(), db.notes.clear(), db.profile.clear()]);
    await db.subjects.bulkAdd(subjects);
    await db.tasks.bulkAdd(tasks);
    await db.notes.bulkAdd(notes);
    if (profile) await db.profile.put(profile);
  });
  return { ok: true, counts: { subjects: subjects.length, tasks: tasks.length, notes: notes.length } };
}
