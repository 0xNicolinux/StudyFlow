import { db } from "./db";
import { leastUsedColor } from "./adaptive";
import {
  BackupSchema,
  ConversationSchema,
  MessageSchema,
  NoteSchema,
  ProfileSchema,
  SubjectSchema,
  TaskSchema,
  type Backup,
  type Conversation,
  type Message,
  type Note,
  type Profile,
  type Subject,
  type Task,
} from "./schemas";

const uid = () => crypto.randomUUID();

export const SUBJECT_COLORS = [
  "#8b7cf6", "#5b9cf5", "#4fc1b0", "#e8b94f", "#e98a6a", "#d47fc4",
  "#22c55e", "#f43f5e", "#f97316", "#06b6d4", "#a3e635", "#818cf8",
  "#c084fc", "#fb7185", "#14b8a6", "#facc15", "#64748b", "#ec4899",
  "#84cc16", "#0ea5e9", "#d946ef", "#78716c",
];

/* ---------- Disciplinas ---------- */
export async function createSubject(input: { name: string; color?: string; goals?: string; icon?: string | null }): Promise<Subject> {
  const now = Date.now();
  const subject = SubjectSchema.parse({
    id: uid(),
    name: input.name,
    // Sem cor escolhida, usa a menos repetida entre as disciplinas existentes (em vez de girar pela contagem).
    color: input.color ?? leastUsedColor(SUBJECT_COLORS, (await db.subjects.toArray()).map((x) => x.color)),
    goals: input.goals ?? "",
    icon: input.icon ?? null,
    createdAt: now,
    updatedAt: now,
  });
  await db.subjects.add(subject);
  return subject;
}

export async function updateSubject(id: string, patch: Partial<Pick<Subject, "name" | "color" | "goals" | "icon">>) {
  const current = await db.subjects.get(id);
  if (!current) throw new Error("Disciplina não encontrada");
  const next = SubjectSchema.parse({ ...current, ...patch, updatedAt: Date.now() });
  await db.subjects.put(next);
  return next;
}

/**
 * Exclui a disciplina e seus dados (tarefas, anotações, flashcards, quizzes e materiais) em uma única transação.
 * O tempo de estudo registrado e as conversas são mantidos, apenas desvinculados.
 */
export async function deleteSubject(id: string) {
  await db.transaction(
    "rw",
    [db.subjects, db.tasks, db.notes, db.conversations, db.studySessions, db.flashcards, db.quizzes, db.quizAttempts, db.documents, db.docTexts, db.docFiles],
    async () => {
      await db.conversations.filter((c) => c.subjectId === id).modify({ subjectId: null });
      await db.studySessions.where("subjectId").equals(id).modify({ subjectId: null });
      await db.tasks.where("subjectId").equals(id).delete();
      await db.notes.where("subjectId").equals(id).delete();
      await db.flashcards.where("subjectId").equals(id).delete();
      await db.quizAttempts.where("subjectId").equals(id).delete();
      await db.quizzes.where("subjectId").equals(id).delete();
      const docIds = await db.documents.where("subjectId").equals(id).primaryKeys();
      await db.docTexts.bulkDelete(docIds);
      await db.docFiles.bulkDelete(docIds);
      await db.documents.bulkDelete(docIds);
      await db.subjects.delete(id);
    },
  );
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

/* ---------- Conversas de IA ---------- */
export async function createConversation(title: string, subjectId: string | null): Promise<Conversation> {
  const c = ConversationSchema.parse({ id: uid(), title: title.trim().slice(0, 60) || "Nova conversa", subjectId, updatedAt: Date.now() });
  await db.conversations.add(c);
  return c;
}

// Timestamps estritamente crescentes: mensagens no mesmo milissegundo manteriam ordem indefinida.
let lastMessageTs = 0;

export async function addMessage(conversationId: string, role: Message["role"], content: string, incomplete = false): Promise<Message> {
  lastMessageTs = Math.max(Date.now(), lastMessageTs + 1);
  const m = MessageSchema.parse({ id: uid(), conversationId, role, content, incomplete, createdAt: lastMessageTs });
  await db.transaction("rw", db.messages, db.conversations, async () => {
    await db.messages.add(m);
    await db.conversations.update(conversationId, { updatedAt: m.createdAt });
  });
  return m;
}

/** Conversas de uma disciplina (ou as gerais, com `null`), da mais recente para a mais antiga. */
export async function listConversations(subjectId: string | null): Promise<Conversation[]> {
  const all = await db.conversations.filter((c) => c.subjectId === subjectId).toArray();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteConversation(id: string) {
  await db.transaction("rw", db.messages, db.conversations, async () => {
    await db.messages.where("conversationId").equals(id).delete();
    await db.conversations.delete(id);
  });
}

/** Apaga só as conversas de uma disciplina (ou as gerais), sem tocar nas demais. */
export async function clearConversations(subjectId: string | null) {
  await db.transaction("rw", db.messages, db.conversations, async () => {
    const ids = await db.conversations.filter((c) => c.subjectId === subjectId).primaryKeys();
    await db.messages.where("conversationId").anyOf(ids).delete();
    await db.conversations.bulkDelete(ids);
  });
}

/* ---------- Perfil ---------- */
export async function saveProfile(input: { name: string; photo: string | null }): Promise<Profile> {
  const profile = ProfileSchema.parse({ id: "me", ...input });
  await db.profile.put(profile);
  return profile;
}

/* ---------- Backup ---------- */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** `includeFiles`: inclui os arquivos originais (base64). Sem isso, o backup leva só metadados e o texto extraído. */
export async function exportBackup(options: { includeFiles?: boolean } = {}): Promise<Backup> {
  const [subjects, tasks, notes, profile, conversations, messages, studySessions, flashcards, quizzes, quizAttempts, documents, docTexts] = await Promise.all([
    db.subjects.toArray(), db.tasks.toArray(), db.notes.toArray(), db.profile.get("me"), db.conversations.toArray(), db.messages.toArray(),
    db.studySessions.toArray(), db.flashcards.toArray(), db.quizzes.toArray(), db.quizAttempts.toArray(), db.documents.toArray(), db.docTexts.toArray(),
  ]);
  const docFiles: Backup["data"]["docFiles"] = [];
  if (options.includeFiles) {
    for (const f of await db.docFiles.toArray()) docFiles.push({ id: f.id, mime: f.blob.type, base64: await blobToBase64(f.blob) });
  }
  const withFile = new Set(docFiles.map((f) => f.id));
  // Sem os arquivos, os documentos exportados são marcados como "sem original" para a importação ser honesta.
  const docs = documents.map((d) => ({ ...d, hasOriginal: options.includeFiles ? withFile.has(d.id) : false }));
  // A chave de API NUNCA entra no backup (fica só no localStorage).
  return { app: "studyflow", version: 1, exportedAt: Date.now(), data: { subjects, tasks, notes, profile: profile ?? null, conversations, messages, studySessions, flashcards, quizzes, quizAttempts, documents: docs, docTexts, docFiles } };
}

export type ImportResult =
  | { ok: true; counts: { subjects: number; tasks: number; notes: number; flashcards: number; quizzes: number; documents: number }; documentsWithoutOriginal: number }
  | { ok: false; error: string };

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
  const d = parsed.data.data;
  const textIds = new Set(d.docTexts.map((t) => t.id));
  if (d.documents.some((doc) => !textIds.has(doc.id))) return { ok: false, error: "Backup inconsistente: há materiais sem texto associado." };
  const fileIds = new Set(d.docFiles.map((f) => f.id));
  const documents = d.documents.map((doc) => ({ ...doc, hasOriginal: fileIds.has(doc.id) }));
  await db.transaction(
    "rw",
    [db.subjects, db.tasks, db.notes, db.profile, db.conversations, db.messages, db.studySessions, db.flashcards, db.quizzes, db.quizAttempts, db.documents, db.docTexts, db.docFiles],
    async () => {
      await Promise.all([
        db.subjects.clear(), db.tasks.clear(), db.notes.clear(), db.profile.clear(), db.conversations.clear(), db.messages.clear(),
        db.studySessions.clear(), db.flashcards.clear(), db.quizzes.clear(), db.quizAttempts.clear(), db.documents.clear(), db.docTexts.clear(), db.docFiles.clear(),
      ]);
      await db.subjects.bulkAdd(d.subjects); await db.tasks.bulkAdd(d.tasks); await db.notes.bulkAdd(d.notes);
      await db.conversations.bulkAdd(d.conversations); await db.messages.bulkAdd(d.messages);
      await db.studySessions.bulkAdd(d.studySessions); await db.flashcards.bulkAdd(d.flashcards);
      await db.quizzes.bulkAdd(d.quizzes); await db.quizAttempts.bulkAdd(d.quizAttempts);
      await db.documents.bulkAdd(documents); await db.docTexts.bulkAdd(d.docTexts);
      await db.docFiles.bulkAdd(d.docFiles.map((f) => ({ id: f.id, blob: base64ToBlob(f.base64, f.mime) })));
      if (d.profile) await db.profile.put(d.profile);
    },
  );
  return {
    ok: true,
    counts: { subjects: d.subjects.length, tasks: d.tasks.length, notes: d.notes.length, flashcards: d.flashcards.length, quizzes: d.quizzes.length, documents: d.documents.length },
    documentsWithoutOriginal: documents.filter((x) => !x.hasOriginal).length,
  };
}
