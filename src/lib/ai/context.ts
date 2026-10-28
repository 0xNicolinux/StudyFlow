import type { ChatTurn } from "./types";

export const LIMITS = { perItem: 12_000, totalContext: 30_000, historyMessages: 20, historyChars: 40_000 };

export type ContextItem = { label: string; text: string; chars: number; truncated: boolean };

export const SYSTEM_PROMPT =
  "Você é o assistente de estudos do StudyFlow. Responda em português do Brasil, de forma clara e didática, usando Markdown (inclua blocos de código quando útil). " +
  "Use o material fornecido pelo estudante quando houver; se a resposta não estiver nele, diga isso em vez de inventar.";

function clip(label: string, text: string, budget: number): ContextItem {
  const max = Math.max(0, Math.min(LIMITS.perItem, budget));
  const truncated = text.length > max;
  return { label, text: truncated ? text.slice(0, max) + "\n[…conteúdo truncado por limite de tamanho…]" : text, chars: Math.min(text.length, max), truncated };
}

/** Monta SOMENTE o que o usuário selecionou. Itens além do orçamento total são truncados/omitidos de forma visível. */
export function buildContextItems(input: {
  subject?: { name: string; goals: string } | null;
  notes: { title: string; body: string }[];
  documents?: { name: string; text: string }[];
  excerpts?: { label: string; text: string }[];
}): ContextItem[] {
  const items: ContextItem[] = [];
  let budget = LIMITS.totalContext;
  if (input.subject) {
    const it = clip(`Disciplina: ${input.subject.name}`, `Disciplina: ${input.subject.name}\nObjetivos: ${input.subject.goals.trim() || "(não informados)"}`, budget);
    items.push(it); budget -= it.chars;
  }
  for (const n of input.notes) {
    const it = clip(`Anotação: ${n.title}`, `# ${n.title}\n${n.body}`, budget);
    items.push(it); budget -= it.chars;
  }
  for (const d of input.documents ?? []) {
    const it = clip(`Documento: ${d.name}`, `# Documento: ${d.name}\n${d.text}`, budget);
    items.push(it); budget -= it.chars;
  }
  for (const x of input.excerpts ?? []) {
    const it = clip(`Trecho de ${x.label}`, `Trecho de “${x.label}”:\n${x.text}`, budget);
    items.push(it); budget -= it.chars;
  }
  return items;
}

export const contextToText = (items: ContextItem[]) =>
  items.length ? "Material de estudo selecionado pelo estudante:\n\n" + items.map((i) => i.text).join("\n\n---\n\n") : "";

export function trimHistory(history: ChatTurn[]): { turns: ChatTurn[]; dropped: number } {
  let turns = history.slice(-LIMITS.historyMessages);
  let total = turns.reduce((n, t) => n + t.content.length, 0);
  while (turns.length > 1 && total > LIMITS.historyChars) { total -= turns[0].content.length; turns = turns.slice(1); }
  return { turns, dropped: history.length - turns.length };
}

export function buildMessages(history: ChatTurn[], userText: string, items: ContextItem[]): { messages: ChatTurn[]; dropped: number } {
  const { turns, dropped } = trimHistory(history);
  const ctx = contextToText(items);
  const content = ctx ? `${ctx}\n\n---\nPergunta do estudante:\n${userText}` : userText;
  return { messages: [{ role: "system", content: SYSTEM_PROMPT }, ...turns, { role: "user", content }], dropped };
}
