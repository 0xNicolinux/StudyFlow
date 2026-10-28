import { z } from "zod";

export const SubjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome da disciplina").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  // Opcional para continuar aceitando disciplinas e backups criados em versões anteriores.
  icon: z.string().max(400_000).nullable().optional(),
  goals: z.string().max(2000).default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().nullable(),
  title: z.string().trim().min(1, "Informe o título").max(200),
  kind: z.enum(["tarefa", "avaliacao"]),
  dueAt: z.number().nullable(),
  done: z.boolean(),
  createdAt: z.number(),
});

export const NoteSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().nullable(),
  title: z.string().trim().min(1, "Informe o título").max(200),
  body: z.string().max(200_000),
  updatedAt: z.number(),
});

export const ProfileSchema = z.object({
  id: z.literal("me"),
  name: z.string().trim().min(1).max(60),
  photo: z.string().max(4_200_000).nullable(),
  cover: z.string().max(4_200_000).nullable().optional(),
  institution: z.string().trim().max(120).optional(),
  educationLevel: z.enum(["fundamental", "medio", "tecnico", "superior", "pos", "outro"]).optional(),
  graduationYear: z.number().int().min(2020).max(2100).nullable().optional(),
  role: z.enum(["estudante", "professor"]).optional(),
  country: z.string().trim().max(60).optional(),
});

export const PostSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().max(2000),
  media: z.string().max(4_200_000).nullable().default(null),
  mediaType: z.enum(["image", "video"]).nullable().default(null),
  mediaName: z.string().max(255).nullable().default(null),
  createdAt: z.number(),
});

export const ConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  subjectId: z.string().nullable(),
  updatedAt: z.number(),
});

export const MessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  incomplete: z.boolean().default(false),
  createdAt: z.number(),
});

export const StudySessionSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().nullable(),
  startedAt: z.number(),
  seconds: z.number().int().min(1),
});

export const FlashcardSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().nullable(),
  front: z.string().trim().min(1, "Informe a frente do cartão").max(2000),
  back: z.string().trim().min(1, "Informe o verso do cartão").max(4000),
  createdAt: z.number(),
  dueAt: z.number(),
  intervalDays: z.number().min(0),
  ease: z.number().min(1.3).max(3),
  correct: z.number().int().min(0),
  wrong: z.number().int().min(0),
});

export const QuizQuestionSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().trim().min(1, "Toda pergunta precisa de enunciado").max(2000),
    options: z.array(z.string().trim().min(1, "Alternativas não podem ficar vazias").max(500)).min(2).max(6),
    answer: z.number().int().min(0),
  })
  .refine((q) => q.answer < q.options.length, { message: "A resposta correta precisa ser uma das alternativas" });

export const QuizSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().nullable(),
  title: z.string().trim().min(1, "Informe o título do quiz").max(120),
  questions: z.array(QuizQuestionSchema).min(1, "Adicione ao menos uma pergunta").max(100),
  createdAt: z.number(),
});

export const QuizAttemptSchema = z.object({
  id: z.string().min(1),
  quizId: z.string().min(1),
  subjectId: z.string().nullable(),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
  at: z.number(),
});

export const DocumentSchema = z.object({
  id: z.string().min(1),
  subjectId: z.string().nullable(),
  name: z.string().min(1).max(255),
  kind: z.enum(["pdf", "txt", "md"]),
  mime: z.string().max(100),
  size: z.number().int().min(0),
  createdAt: z.number(),
  status: z.enum(["ok", "empty", "error"]),
  error: z.string().nullable(),
  pages: z.number().int().nullable(),
  chars: z.number().int().min(0),
  truncated: z.boolean(),
  hasOriginal: z.boolean(),
});

export const DocTextSchema = z.object({ id: z.string().min(1), text: z.string() });
export const DocFileBackupSchema = z.object({ id: z.string().min(1), mime: z.string(), base64: z.string() });

export const BackupSchema = z.object({
  app: z.literal("studyflow"),
  version: z.literal(1),
  exportedAt: z.number(),
  data: z.object({
    subjects: z.array(SubjectSchema),
    tasks: z.array(TaskSchema),
    notes: z.array(NoteSchema),
    profile: ProfileSchema.nullable(),
    // Optional for older v1 backups created before the local profile feed existed.
    posts: z.array(PostSchema).default([]),
    // Opcionais: backups antigos (sem conversas) continuam válidos.
    conversations: z.array(ConversationSchema).default([]),
    messages: z.array(MessageSchema).default([]),
    studySessions: z.array(StudySessionSchema).default([]),
    flashcards: z.array(FlashcardSchema).default([]),
    quizzes: z.array(QuizSchema).default([]),
    quizAttempts: z.array(QuizAttemptSchema).default([]),
    documents: z.array(DocumentSchema).default([]),
    docTexts: z.array(DocTextSchema).default([]),
    // Arquivos originais só entram no backup se o usuário pedir (podem ser grandes).
    docFiles: z.array(DocFileBackupSchema).default([]),
  }),
});

export type Subject = z.infer<typeof SubjectSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type ProfilePost = z.infer<typeof PostSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type StudySession = z.infer<typeof StudySessionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type Quiz = z.infer<typeof QuizSchema>;
export type QuizAttempt = z.infer<typeof QuizAttemptSchema>;
export type StudyDocument = z.infer<typeof DocumentSchema>;
export type DocText = z.infer<typeof DocTextSchema>;
export type Backup = z.infer<typeof BackupSchema>;
