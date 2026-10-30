"use client";
import { useCallback, useRef, useState } from "react";
import { db } from "@/lib/db";
import { addMessage, createConversation } from "@/lib/repo";
import { AiError } from "@/lib/ai/types";
import { GenerationToolDefinitions, validateGenerationToolCall, type GenerationToolName } from "@/lib/ai/generation";
import { enqueueGenerationJob } from "@/lib/generation-jobs";
import { getProvider } from "@/lib/ai/openai-compatible";
import { assertReady, loadSettings, saveSettings } from "@/lib/ai/settings";
import { buildContextItems, buildMessages, contextToText, type ContextItem } from "@/lib/ai/context";

export type Excerpt = { id: string; label: string; text: string };
export type Selection = { useSubject: boolean; noteIds: string[]; docIds: string[]; excerpts: Excerpt[] };
const EMPTY_SELECTION: Selection = { useSubject: false, noteIds: [], docIds: [], excerpts: [] };
export type Pending = { text: string; items: ContextItem[]; dropped: number; host: string; model: string };

const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };

export function useChat(activeSubjectId: string | null) {
  // Cada disciplina (e a área geral, chave "") lembra a própria conversa aberta: trocar de disciplina não mistura históricos.
  const scopeKey = activeSubjectId ?? "";
  const [openByScope, setOpenByScope] = useState<Record<string, string | null>>({});
  const conversationId = openByScope[scopeKey] ?? null;
  const [streamConvId, setStreamConvId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<AiError | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const abortRef = useRef<AbortController | null>(null);

  const collectItems = useCallback(async (): Promise<ContextItem[]> => {
    const subject = selection.useSubject && activeSubjectId ? (await db.subjects.get(activeSubjectId)) ?? null : null;
    const notes = (await db.notes.bulkGet(selection.noteIds)).filter((n): n is NonNullable<typeof n> => !!n);
    const docs = (await db.documents.bulkGet(selection.docIds)).filter((d): d is NonNullable<typeof d> => !!d && d.status === "ok");
    const texts = await db.docTexts.bulkGet(docs.map((d) => d.id));
    const documents = docs.map((d, i) => ({ name: d.name, text: texts[i]?.text ?? "" }));
    return buildContextItems({ subject: subject && { name: subject.name, goals: subject.goals }, notes, documents, excerpts: selection.excerpts });
  }, [selection, activeSubjectId]);

  /** Executa a chamada real. `persistUser=false` reaproveita a última mensagem do usuário (retry). */
  const run = useCallback(async (convId: string, text: string, items: ContextItem[], persistUser: boolean) => {
    setError(null); setStreamText(""); setStreamConvId(convId); setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    try {
      const cfg = assertReady(loadSettings());
      const settings = loadSettings();
      const all = await db.messages.where("conversationId").equals(convId).sortBy("createdAt");
      const history = (persistUser ? all : all.slice(0, -1)).map((m) => ({ role: m.role, content: m.content }));
      const sourceMessageId = persistUser
        ? (await addMessage(convId, "user", text)).id
        : [...all].reverse().find((message) => message.role === "user")?.id ?? crypto.randomUUID();
      const { messages } = buildMessages(history, text, items);
      messages[0].content += " Quando o estudante solicitar explicitamente a criação de flashcards, quiz ou anotação, use a ferramenta correspondente. Não use ferramentas para perguntas conceituais ou simples pedidos de explicação. Se faltar um assunto essencial, faça uma pergunta de esclarecimento em texto antes de criar. Nunca diga que salvou: apenas solicite a criação; o aplicativo valida e salva.";
      const toolCalls: Array<{ id: string; name: string; arguments: unknown }> = [];
      for await (const event of getProvider(settings.provider).streamChat({
        ...cfg,
        messages,
        tools: GenerationToolDefinitions,
        toolChoice: "auto",
        signal: ctrl.signal,
      })) {
        if (event.type === "text") {
          acc += event.text;
          setStreamText(acc);
        } else {
          toolCalls.push(event);
        }
      }

      // Valida todas as chamadas primeiro: uma chamada malformada não pode deixar as anteriores parcialmente enfileiradas.
      const validatedCalls = toolCalls.map((call) => ({
        ...call,
        validated: validateGenerationToolCall(call.name, call.arguments),
      }));
      if (validatedCalls.length) {
        const contextText = contextToText(items);
        for (const call of validatedCalls) {
          await enqueueGenerationJob({
            kind: call.validated.kind,
            title: call.validated.title,
            subjectId: activeSubjectId,
            source: "chat",
            sourceKey: `${convId}:${sourceMessageId}:${call.id}`,
            toolName: call.name as GenerationToolName,
            payload: call.validated.data,
            requestText: text,
            contextText,
          });
        }
        const summary = validatedCalls.map((call) => {
          const label = call.validated.kind === "flashcards" ? "flashcards" : call.validated.kind === "quiz" ? "quiz" : "anotação";
          const count = call.validated.kind === "flashcards" ? call.validated.data.cards.length
            : call.validated.kind === "quiz" ? call.validated.data.questions.length : 1;
          return `${label} “${call.validated.title}” (${count} ${call.validated.kind === "flashcards" ? "cartões" : call.validated.kind === "quiz" ? "perguntas" : "anotação"})`;
        }).join(" e ");
        acc = [acc.trim(), `Estou preparando ${summary}. Avisarei quando estiver pronto.`].filter(Boolean).join("\n\n");
        setStreamText(acc);
      }
      if (acc.trim()) await addMessage(convId, "assistant", acc);
      else throw new AiError("stream", "O modelo não retornou conteúdo nem solicitou uma ação. Tente novamente ou troque de modelo.");
    } catch (e) {
      const original = e instanceof AiError ? e : new AiError("stream", "Ocorreu um erro inesperado ao falar com a IA.");
      const err = original.kind === "tools_unsupported"
        ? new AiError("tools_unsupported", "Este modelo não aceita criação direta pela conversa. Abra Flashcards, Quizzes ou Anotações e use “Gerar com IA” para continuar.")
        : original;
      // Texto parcial já recebido é preservado e marcado como incompleto; nada é fingido como resposta completa.
      if (acc) await addMessage(convId, "assistant", acc, true);
      if (err.kind !== "aborted" || !acc) setError(err);
    } finally {
      // O texto de streaming permanece até a mensagem gravada aparecer na lista (a tela decide quando ocultá-lo); evita uma "piscada".
      setStreaming(false); abortRef.current = null;
    }
  }, [activeSubjectId]);

  const start = useCallback(async (text: string, items: ContextItem[]) => {
    let convId = conversationId;
    if (!convId) {
      convId = (await createConversation(text, activeSubjectId)).id;
      const created = convId;
      setOpenByScope((o) => ({ ...o, [scopeKey]: created }));
    }
    await run(convId, text, items, true);
  }, [conversationId, activeSubjectId, scopeKey, run]);

  /** Retorna "started" se a mensagem seguiu (ou aguarda confirmação) e "blocked" se faltou configuração. */
  const send = useCallback(async (text: string): Promise<"started" | "blocked"> => {
    if (streaming) return "blocked";
    const settings = loadSettings();
    try { assertReady(settings); } catch (e) { setError(e as AiError); return "blocked"; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError(new AiError("offline", "Você está sem internet. A IA remota está indisponível, mas seus dados locais continuam acessíveis.")); return "blocked";
    }
    const items = await collectItems();
    const { dropped } = buildMessages(
      conversationId ? (await db.messages.where("conversationId").equals(conversationId).sortBy("createdAt")).map((m) => ({ role: m.role, content: m.content })) : [],
      text, items,
    );
    const cfg = assertReady(settings);
    if (items.length > 0 || !settings.consentGiven) {
      setPending({ text, items, dropped, host: hostOf(cfg.baseUrl), model: cfg.model });
      return "started";
    }
    void start(text, items);
    return "started";
  }, [streaming, conversationId, collectItems, start]);

  const confirmPending = useCallback(() => {
    if (!pending) return;
    saveSettings({ ...loadSettings(), consentGiven: true });
    const p = pending; setPending(null);
    void start(p.text, p.items);
  }, [pending, start]);

  const retry = useCallback(async () => {
    if (!conversationId || streaming) return;
    const all = await db.messages.where("conversationId").equals(conversationId).sortBy("createdAt");
    let i = all.length;
    while (i > 0 && all[i - 1].role === "assistant" && all[i - 1].incomplete) { await db.messages.delete(all[i - 1].id); i--; }
    const last = all[i - 1];
    if (!last || last.role !== "user") return;
    await run(conversationId, last.content, await collectItems(), false);
  }, [conversationId, streaming, run, collectItems]);

  return {
    conversationId, streamConvId,
    setConversationId: (id: string | null) => { setStreamText(""); setOpenByScope((o) => ({ ...o, [scopeKey]: id })); },
    streaming, streamText, error, clearError: () => setError(null),
    pending, cancelPending: () => setPending(null), confirmPending,
    selection, setSelection,
    toggleDoc: (id: string) => setSelection((s) => ({ ...s, docIds: s.docIds.includes(id) ? s.docIds.filter((x) => x !== id) : [...s.docIds, id] })),
    addExcerpt: (label: string, text: string) => setSelection((s) => ({ ...s, excerpts: [...s.excerpts, { id: crypto.randomUUID(), label, text }] })),
    removeExcerpt: (id: string) => setSelection((s) => ({ ...s, excerpts: s.excerpts.filter((x) => x.id !== id) })),
    send, retry, stop: () => abortRef.current?.abort(),
    newConversation: () => { setStreamText(""); setOpenByScope((o) => ({ ...o, [scopeKey]: null })); setError(null); setSelection(EMPTY_SELECTION); },
  };
}
export type ChatController = ReturnType<typeof useChat>;
