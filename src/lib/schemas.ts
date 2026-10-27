import { z } from "zod";

export const SubjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Informe o nome da disciplina").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
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
  photo: z.string().max(700_000).nullable(),
});

export const BackupSchema = z.object({
  app: z.literal("studyflow"),
  version: z.literal(1),
  exportedAt: z.number(),
  data: z.object({
    subjects: z.array(SubjectSchema),
    tasks: z.array(TaskSchema),
    notes: z.array(NoteSchema),
    profile: ProfileSchema.nullable(),
  }),
});

export type Subject = z.infer<typeof SubjectSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Backup = z.infer<typeof BackupSchema>;
