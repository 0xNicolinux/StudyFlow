import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { AiError, type ChatStreamEvent } from "./types";
import { streamOpenAiCompatible } from "./openai-compatible";
import { DEFAULT_SETTINGS, __setStore, assertReady, fetchModels, loadSettings, saveSettings, validateBaseUrl } from "./settings";
import { LIMITS, buildContextItems, buildMessages } from "./context";
import { StudyFlowDB, db, __setDb } from "../db";
import { addMessage, createConversation, createSubject, deleteSubject, exportBackup, importBackup } from "../repo";

const sse = (...lines: string[]) =>
  new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); lines.forEach((l) => c.enqueue(e.encode(l))); c.close(); } }), { status: 200 });
const chunk = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
const req = (fetchImpl: typeof fetch) => ({ baseUrl: "https://x.test/api/v1/", apiKey: "sk-secret", model: "m", messages: [{ role: "user" as const, content: "oi" }], fetchImpl });
async function collect(g: AsyncGenerator<ChatStreamEvent>) { const events: ChatStreamEvent[] = []; for await (const event of g) events.push(event); return events; }
async function collectText(g: AsyncGenerator<ChatStreamEvent>) { return (await collect(g)).filter((e) => e.type === "text").map((e) => e.text).join(""); }
const toolDelta = (index: number, fn: { name?: string; arguments?: string }, id?: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index, ...(id ? { id, type: "function" } : {}), function: fn }] } }] })}\\n\\n`;
async function kindOf(p: Promise<unknown>) { try { await p; return "none"; } catch (e) { return e instanceof AiError ? e.kind : "other"; } }

describe("streaming", () => {
  it("concatena deltas, ignora keep-alive e para em [DONE]", async () => {
    const f = vi.fn().mockResolvedValue(sse(": OPENROUTER PROCESSING\n\n", chunk("Olá"), chunk(", mundo"), "data: [DONE]\n\n", chunk("NÃO")));
    expect(await collectText(streamOpenAiCompatible(req(f)))).toBe("Olá, mundo");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://x.test/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-secret");
    expect(JSON.parse(init.body).stream).toBe(true);
  });

  it("remonta tool calls com argumentos JSON divididos em vários deltas", async () => {
    const f = vi.fn().mockResolvedValue(sse(
      toolDelta(0, { name: "create_flashcards", arguments: "{\\"title\\":\\"POO\\",\\"cards\\":[{\\"front\\":\\"Classe?" }, "call-0"),
      toolDelta(0, { arguments: "\\"}]}"}),
      "data: [DONE]\\n\\n",
    ));
    const events = await collect(streamOpenAiCompatible({
      ...req(f),
      tools: [{ type: "function", function: { name: "create_flashcards", description: "Cria cartões", parameters: { type: "object" } } }],
      toolChoice: "auto",
    }));
    expect(events).toEqual([{ type: "tool_call", id: "call-0", name: "create_flashcards", arguments: { title: "POO", cards: [{ front: "Classe?" }] } }]);
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.tools[0].function.name).toBe("create_flashcards");
    expect(body.tool_choice).toBe("auto");
  });

  it("remonta múltiplas ferramentas pela ordem dos índices", async () => {
    const f = vi.fn().mockResolvedValue(sse(
      toolDelta(1, { name: "create_quiz", arguments: "{\\"title\\":\\"Q\\"}" }, "call-1"),
      toolDelta(0, { name: "create_note", arguments: "{\\"title\\":\\"N\\"}" }, "call-0"),
      "data: [DONE]\\n\\n",
    ));
    const events = await collect(streamOpenAiCompatible(req(f)));
    expect(events.map((event) => event.type === "tool_call" ? [event.id, event.name, event.arguments] : event)).toEqual([
      ["call-0", "create_note", { title: "N" }],
      ["call-1", "create_quiz", { title: "Q" }],
    ]);
  });

  it("rejeita argumentos de ferramenta que não formam JSON", async () => {
    const f = vi.fn().mockResolvedValue(sse(
      toolDelta(0, { name: "create_note", arguments: "{invalid" }, "call-0"),
      "data: [DONE]\\n\\n",
    ));
    expect(await kindOf(collect(streamOpenAiCompatible(req(f))))).toBe("tool_call_invalid");
  });

  it("mantém eventos de texto quando não há tool calls", async () => {
    const f = vi.fn().mockResolvedValue(sse(chunk("resposta"), "data: [DONE]\\n\\n"));
    expect(await collect(streamOpenAiCompatible(req(f)))).toEqual([{ type: "text", text: "resposta" }]);
  });

  it("remonta linhas SSE partidas entre pedaços", async () => {
    const full = chunk("abc");
    const f = vi.fn().mockResolvedValue(sse(full.slice(0, 15), full.slice(15), "data: [DONE]\n\n"));
    expect(await collectText(streamOpenAiCompatible(req(f)))).toBe("abc");
  });

  it("erro no meio do stream vira AiError('stream') mantendo o texto parcial já entregue", async () => {
    const f = vi.fn().mockResolvedValue(sse(chunk("parcial"), `data: ${JSON.stringify({ error: { message: "boom" } })}\n\n`));
    const g = streamOpenAiCompatible(req(f));
    const first = await g.next();
    expect(first.value).toEqual({ type: "text", text: "parcial" });
    expect(await kindOf(g.next())).toBe("stream");
  });

  it.each([[401, "auth"], [402, "credits"], [403, "forbidden"], [429, "rate_limit"], [400, "bad_request"], [503, "server"]])(
    "HTTP %i -> %s",
    async (status, kind) => {
      const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "x" } }), { status }));
      expect(await kindOf(collectText(streamOpenAiCompatible(req(f))))).toBe(kind);
    },
  );

  it("falha de rede vira 'network' e a mensagem não contém a chave", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    try { await collectText(streamOpenAiCompatible(req(f))); } catch (e) {
      expect((e as AiError).kind).toBe("network");
      expect((e as AiError).message).not.toContain("sk-secret");
    }
  });

  it("abort vira 'aborted'", async () => {
    const f = vi.fn().mockRejectedValue(Object.assign(new Error("a"), { name: "AbortError" }));
    expect(await kindOf(collectText(streamOpenAiCompatible(req(f))))).toBe("aborted");
  });
});

describe("configuração", () => {
  beforeEach(() => { const m = new Map<string, string>(); __setStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }); });

  it("sem chave ou sem modelo falha ANTES de qualquer requisição", () => {
    expect(() => assertReady(DEFAULT_SETTINGS)).toThrowError(/chave/);
    expect(() => assertReady({ ...DEFAULT_SETTINGS, apiKey: "k" })).toThrowError(/modelo/);
    expect(assertReady({ ...DEFAULT_SETTINGS, apiKey: "k", model: "a/b" }).baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("persiste e recarrega; JSON corrompido volta ao padrão", () => {
    saveSettings({ ...DEFAULT_SETTINGS, apiKey: "k", model: "a/b" });
    expect(loadSettings().model).toBe("a/b");
    __setStore({ getItem: () => "{lixo", setItem() {}, removeItem() {} });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("exige https (exceto localhost)", () => {
    expect(validateBaseUrl("http://evil.test/v1")).not.toBeNull();
    expect(validateBaseUrl("http://localhost:11434/v1")).toBeNull();
    expect(validateBaseUrl("https://openrouter.ai/api/v1")).toBeNull();
  });

  it("lista modelos e marca gratuitos pelo preço zero", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: "b/pago", pricing: { prompt: "0.000001", completion: "0.000002" } },
      { id: "a/free", pricing: { prompt: "0", completion: "0" } },
      { id: "c/sem-preco" }, { nome: "inválido" },
    ] })));
    const r = await fetchModels(DEFAULT_SETTINGS, f);
    expect(r).toEqual([{ id: "a/free", free: true }, { id: "b/pago", free: false }, { id: "c/sem-preco", free: false }]);
    expect((f.mock.calls[0][1] as RequestInit).headers).toEqual({}); // OpenRouter: sem chave na listagem
  });
});

describe("contexto enviado", () => {
  it("sem seleção, envia apenas system + pergunta", () => {
    const { messages } = buildMessages([], "o que é limite?", []);
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(messages[1].content).toBe("o que é limite?");
  });

  it("inclui somente as anotações selecionadas", () => {
    const items = buildContextItems({ subject: { name: "Cálculo", goals: "8" }, notes: [{ title: "Limites", body: "lim x" }] });
    const { messages } = buildMessages([], "explique", items);
    expect(messages[1].content).toContain("Limites");
    expect(messages[1].content).toContain("Objetivos: 8");
    expect(messages[1].content).not.toContain("Derivadas");
  });

  it("trunca de forma visível e respeita o orçamento total", () => {
    const big = "x".repeat(LIMITS.perItem * 2);
    const items = buildContextItems({ notes: [1, 2, 3, 4].map((i) => ({ title: `n${i}`, body: big })) });
    expect(items[0].truncated).toBe(true);
    expect(items.reduce((n, i) => n + i.chars, 0)).toBeLessThanOrEqual(LIMITS.totalContext);
    expect(items[0].text).toContain("truncado");
  });

  it("limita o histórico enviado", () => {
    const hist = Array.from({ length: 50 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    const { messages, dropped } = buildMessages(hist, "nova", []);
    expect(messages.length).toBe(1 + LIMITS.historyMessages + 1);
    expect(dropped).toBe(30);
  });
});

describe("contexto com documentos e trechos", () => {
  it("inclui só os documentos/trechos passados, com rótulos distintos", () => {
    const items = buildContextItems({ notes: [], documents: [{ name: "apostila.pdf", text: "TEXTO-DOC" }], excerpts: [{ label: "livro.pdf", text: "TRECHO-X" }] });
    expect(items.map((i) => i.label)).toEqual(["Documento: apostila.pdf", "Trecho de livro.pdf"]);
    const { messages } = buildMessages([], "resuma", items);
    expect(messages[1].content).toContain("TEXTO-DOC");
    expect(messages[1].content).toContain("TRECHO-X");
  });
  it("documento grande é truncado de forma visível e o total respeita o orçamento", () => {
    const items = buildContextItems({ notes: [], documents: [1, 2, 3, 4].map((i) => ({ name: `d${i}`, text: "y".repeat(LIMITS.perItem * 3) })) });
    expect(items[0].truncated).toBe(true);
    expect(items.reduce((n, i) => n + i.chars, 0)).toBeLessThanOrEqual(LIMITS.totalContext);
  });
});

describe("conversas e backup", () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory(); __setDb(new StudyFlowDB(`t-${Math.random()}`)); });

  it("persiste mensagens e atualiza a conversa", async () => {
    const c = await createConversation("Dúvida", null);
    await addMessage(c.id, "user", "oi");
    await addMessage(c.id, "assistant", "olá", true);
    const ms = await db.messages.where("conversationId").equals(c.id).sortBy("createdAt");
    expect(ms.map((m) => [m.role, m.incomplete])).toEqual([["user", false], ["assistant", true]]);
  });

  it("excluir disciplina preserva a conversa, apenas desvinculando-a", async () => {
    const s = await createSubject({ name: "A" });
    const c = await createConversation("x", s.id);
    await deleteSubject(s.id);
    expect((await db.conversations.get(c.id))?.subjectId).toBeNull();
  });

  it("backup inclui conversas, nunca a chave, e backups antigos (v1 sem conversas) ainda importam", async () => {
    const c = await createConversation("x", null);
    await addMessage(c.id, "user", "oi");
    const json = JSON.stringify(await exportBackup());
    expect(json).not.toMatch(/apiKey|sk-/);
    __setDb(new StudyFlowDB(`t-${Math.random()}`));
    expect((await importBackup(json)).ok).toBe(true);
    expect(await db.messages.count()).toBe(1);

    const legacy = JSON.stringify({ app: "studyflow", version: 1, exportedAt: 1, data: { subjects: [], tasks: [], notes: [], profile: null } });
    expect((await importBackup(legacy)).ok).toBe(true);
  });
});
