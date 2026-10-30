import { z } from "zod";
import { AiError, type ChatTurn, type ToolDefinition } from "./types";
import type { GenerationJob } from "../schemas";
import { getProvider } from "./openai-compatible";
import { assertReady, loadSettings } from "./settings";
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

/** Valida JSON puro (ou cercado por bloco ```json) usado pelo fallback guiado quando tools não estão disponíveis. */
export function parseCategoryFallbackText(toolName: string, response: string): unknown {
  const trimmed = response.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fenced ? fenced[1] : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AiError("tool_call_invalid", "O modelo não retornou JSON válido na criação guiada. Tente novamente ou informe o assunto de outra forma.");
  }
  return validateGenerationToolCall(toolName, parsed).data;
}

/** Gera um payload usando somente a ferramenta correspondente ao tipo solicitado pela categoria. */
export async function generateCategoryToolPayload(job: GenerationJob, signal?: AbortSignal): Promise<unknown> {
  const definition = GenerationToolDefinitions.find((tool) => tool.function.name === job.toolName);
  if (!definition) throw new Error("Tipo de conteúdo não permitido.");
  const settings = loadSettings();
  const config = assertReady(settings);
  const context = job.contextText.trim()
    ? `Material de estudo escolhido pelo estudante:\n\n${job.contextText.trim()}`
    : "Nenhum material foi selecionado. Baseie-se apenas no assunto escrito pelo estudante e não invente fontes.";
  const messages: ChatTurn[] = [
    {
      role: "system",
      content: "Você é o gerador de conteúdo de estudo do StudyFlow. Produza conteúdo correto, didático e em português brasileiro. Use exclusivamente a ferramenta fornecida para criar o conteúdo solicitado. Não responda com Markdown ou texto no lugar da ferramenta. Respeite a quantidade solicitada e não invente referências.",
    },
    {
      role: "user",
      content: `${context}\n\nPedido do estudante:\n${job.requestText}`,
    },
  ];
  try {
    const calls = [];
    for await (const event of getProvider(settings.provider).streamChat({
      ...config,
      messages,
      tools: [definition],
      toolChoice: { type: "function", function: { name: job.toolName } },
      signal,
    })) {
      if (event.type !== "tool_call") continue;
      if (event.name !== job.toolName) throw new AiError("tool_call_invalid", "O modelo tentou usar uma ferramenta diferente da solicitada.");
      calls.push(event);
    }
    if (calls.length !== 1) {
      throw new AiError("tools_unsupported", "O modelo não retornou uma chamada estruturada. Vou tentar o formato guiado.");
    }
    return validateGenerationToolCall(job.toolName, calls[0].arguments).data;
  } catch (error) {
    if (!(error instanceof AiError) || error.kind !== "tools_unsupported") throw error;
  }

  const fallbackMessages: ChatTurn[] = [
    {
      role: "system",
      content: `Você é o gerador de conteúdo do StudyFlow. Responda apenas com um objeto JSON válido, sem Markdown, cercas de código ou explicações. O formato deve corresponder à ferramenta ${job.toolName}. O JSON será validado automaticamente; não inclua propriedades adicionais.`,
    },
    {
      role: "user",
      content: `${context}\n\nPedido do estudante:\n${job.requestText}\n\nContrato JSON exigido:\n${JSON.stringify(definition.function.parameters)}`,
    },
  ];
  let response = "";
  for await (const event of getProvider(settings.provider).streamChat({
    ...config,
    messages: fallbackMessages,
    signal,
  })) {
    if (event.type === "text") response += event.text;
  }
  return parseCategoryFallbackText(job.toolName, response);
}
