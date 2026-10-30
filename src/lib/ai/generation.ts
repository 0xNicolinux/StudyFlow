import { z } from "zod";
import type { ToolDefinition } from "./types";
import { createNote } from "../repo";
import { createFlashcardsBatch, saveQuiz } from "../study-repo";

const FlashcardsInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  cards: z.array(z.object({
    front: z.string().trim().min(1).max(400),
    back: z.string().trim().min(1).max(400),
  }).strict()).min(1).max(100),
}).strict();

const QuizInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  questions: z.array(z.object({
    prompt: z.string().trim().min(1).max(2000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
    answer: z.number().int().min(0),
  }).strict().refine((question) => question.answer < question.options.length, {
    message: "A resposta correta precisa ser uma das alternativas.",
  })).min(1).max(100),
}).strict();

const NoteInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(200_000),
}).strict();

export type GenerationKind = "flashcards" | "quiz" | "note";
export type GenerationToolName = "create_flashcards" | "create_quiz" | "create_note";
export type GenerationResult = {
  kind: GenerationKind;
  title: string;
  contentId: string;
  count: number;
};

export type ValidatedGenerationPayload =
  | { kind: "flashcards"; title: string; data: z.infer<typeof FlashcardsInputSchema> }
  | { kind: "quiz"; title: string; data: z.infer<typeof QuizInputSchema> }
  | { kind: "note"; title: string; data: z.infer<typeof NoteInputSchema> };

export const GenerationToolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_flashcards",
      description: "Cria e salva flashcards quando o estudante pedir explicitamente cartões de estudo. Gere perguntas e respostas curtas, fiéis ao contexto selecionado.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Título do conjunto de flashcards." },
          cards: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                front: { type: "string", description: "Pergunta ou termo mostrado na frente." },
                back: { type: "string", description: "Resposta concisa mostrada no verso." },
              },
              required: ["front", "back"],
            },
          },
        },
        required: ["title", "cards"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_quiz",
      description: "Cria e salva um quiz de múltipla escolha quando o estudante pedir explicitamente um quiz ou teste.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          questions: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                prompt: { type: "string" },
                options: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
                answer: { type: "integer", minimum: 0 },
              },
              required: ["prompt", "options", "answer"],
            },
          },
        },
        required: ["title", "questions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Cria e salva uma anotação em Markdown quando o estudante pedir explicitamente um resumo ou anotação.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          body: { type: "string", description: "Conteúdo da anotação em Markdown." },
        },
        required: ["title", "body"],
      },
    },
  },
];

export function validateGenerationToolCall(name: string, args: unknown): ValidatedGenerationPayload {
  switch (name) {
    case "create_flashcards": {
      const data = FlashcardsInputSchema.parse(args);
      return { kind: "flashcards", title: data.title, data };
    }
    case "create_quiz": {
      const data = QuizInputSchema.parse(args);
      return { kind: "quiz", title: data.title, data };
    }
    case "create_note": {
      const data = NoteInputSchema.parse(args);
      return { kind: "note", title: data.title, data };
    }
    default:
      throw new Error("A IA tentou executar uma ferramenta não permitida.");
  }
}

/** Único ponto autorizado a transformar payloads da IA em registros locais. */
export async function dispatchGenerationTool(name: string, args: unknown, subjectId: string | null): Promise<GenerationResult> {
  const validated = validateGenerationToolCall(name, args);
  switch (validated.kind) {
    case "flashcards": {
      const saved = await createFlashcardsBatch({ subjectId, cards: validated.data.cards });
      return { kind: "flashcards", title: validated.title, contentId: saved[0].id, count: saved.length };
    }
    case "quiz": {
      const saved = await saveQuiz({ title: validated.title, subjectId, questions: validated.data.questions });
      return { kind: "quiz", title: validated.title, contentId: saved.id, count: saved.questions.length };
    }
    case "note": {
      const saved = await createNote({ title: validated.title, subjectId, body: validated.data.body });
      return { kind: "note", title: saved.title, contentId: saved.id, count: 1 };
    }
  }
}
