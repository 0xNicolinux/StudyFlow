import { AiError, type AiProvider, type StreamRequest, type ToolCall } from "./types";

const joinUrl = (base: string, path: string) => `${base.endsWith("/") ? base.slice(0, -1) : base}${path.startsWith("/") ? path : `/${path}`}`;

type PartialToolCall = { id?: string; name: string; arguments: string };

/** Converte uma resposta HTTP de erro em um AiError com mensagem útil. Nunca inclui a chave. */
export async function errorFromResponse(res: Response, toolsRequested = false): Promise<AiError> {
  let detail = "";
  try {
    const j = await res.json();
    const m = j?.error?.message;
    if (typeof m === "string") detail = m.slice(0, 300);
  } catch { /* corpo não é JSON */ }
  const extra = detail ? ` (${detail})` : "";
  if (toolsRequested && /tools?[^.]{0,50}(not supported|unsupported)|does not support[^.]{0,50}tools?|tool[_ ]calling[^.]{0,50}(not supported|unsupported)|tool_choice[^.]{0,50}(not supported|unsupported)/i.test(detail)) {
    return new AiError("tools_unsupported", "Este modelo não oferece suporte a chamadas de ferramentas. Use a criação guiada pela categoria.");
  }
  switch (res.status) {
    case 401: return new AiError("auth", "A chave de API foi recusada. Verifique se ela está correta e ativa.");
    case 402: return new AiError("credits", `Créditos insuficientes neste provedor. Adicione créditos ou escolha um modelo gratuito.${extra}`);
    case 403: return new AiError("forbidden", `O provedor negou o acesso a este modelo ou conteúdo.${extra}`);
    case 429: return new AiError("rate_limit", "Limite de requisições atingido. Aguarde um pouco ou troque de modelo.");
    case 400: case 404: case 422: return new AiError("bad_request", `Requisição recusada pelo provedor. Confira o modelo e o endpoint.${extra}`);
    default:
      if (res.status >= 500 || res.status === 408) return new AiError("server", `O provedor está indisponível no momento (HTTP ${res.status}). Tente novamente.`);
      return new AiError("bad_request", `Resposta inesperada do provedor (HTTP ${res.status}).${extra}`);
  }
}

function finalizeToolCalls(partials: Map<number, PartialToolCall>): ToolCall[] {
  return [...partials.entries()].sort(([a], [b]) => a - b).map(([index, part]) => {
    if (!part.name.trim() || !part.arguments.trim()) {
      throw new AiError("tool_call_invalid", "O provedor retornou uma chamada de ferramenta incompleta.");
    }
    let args: unknown;
    try { args = JSON.parse(part.arguments); }
    catch { throw new AiError("tool_call_invalid", "A IA retornou argumentos inválidos para uma ferramenta. Tente novamente."); }
    return { id: part.id || `call-${index}`, name: part.name, arguments: args };
  });
}

export async function* streamOpenAiCompatible(req: StreamRequest): AsyncGenerator<import("./types").ChatStreamEvent, void, void> {
  const f = req.fetchImpl ?? fetch;
  let res: Response;
  const body = {
    model: req.model,
    messages: req.messages,
    stream: true,
    ...(req.tools?.length ? { tools: req.tools, tool_choice: req.toolChoice ?? "auto" } : {}),
  };
  try {
    res = await f(joinUrl(req.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${req.apiKey}` },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new AiError("aborted", "Resposta interrompida.");
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new AiError(offline ? "offline" : "network", offline ? "Você está sem internet. A IA remota está indisponível, mas seus dados locais continuam acessíveis." : "Não foi possível alcançar o provedor. Verifique sua conexão e o endpoint.");
  }
  if (!res.ok) throw await errorFromResponse(res, !!req.tools?.length);
  if (!res.body) throw new AiError("stream", "O provedor não enviou uma resposta em streaming.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const partialTools = new Map<number, PartialToolCall>();
  let buffer = "";
  let finished = false;

  const processDataLine = (rawLine: string): string | null => {
    const line = rawLine.trim();
    if (!line || line.startsWith(":") || !line.startsWith("data:")) return null;
    const data = line.slice(5).trim();
    if (data === "[DONE]") { finished = true; return null; }
    let obj: {
      error?: { message?: string };
      choices?: Array<{
        delta?: {
          content?: unknown;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    try { obj = JSON.parse(data); } catch { return null; }
    if (obj.error) throw new AiError("stream", `O provedor interrompeu a resposta: ${String(obj.error.message ?? "erro desconhecido").slice(0, 200)}`);
    const delta = obj.choices?.[0]?.delta;
    for (const tool of delta?.tool_calls ?? []) {
      const index = tool.index ?? 0;
      const current = partialTools.get(index) ?? { name: "", arguments: "" };
      if (tool.id) current.id = tool.id;
      if (tool.function?.name) current.name += tool.function.name;
      if (tool.function?.arguments) current.arguments += tool.function.arguments;
      partialTools.set(index, current);
    }
    return typeof delta?.content === "string" && delta.content ? delta.content : null;
  };

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const text = processDataLine(line);
        if (text) yield { type: "text", text };
        if (finished) break;
      }
    }
    if (buffer.trim() && !finished) {
      const text = processDataLine(buffer);
      if (text) yield { type: "text", text };
    }
    for (const tool of finalizeToolCalls(partialTools)) yield { type: "tool_call", ...tool };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if ((e as Error)?.name === "AbortError") throw new AiError("aborted", "Resposta interrompida.");
    throw new AiError("stream", "A conexão foi interrompida durante a resposta.");
  } finally {
    reader.releaseLock?.();
  }
}

export const openrouterProvider: AiProvider = {
  id: "openrouter",
  label: "OpenRouter",
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  editableEndpoint: false,
  streamChat: streamOpenAiCompatible,
};

export const customProvider: AiProvider = {
  id: "custom",
  label: "Outro (compatível com OpenAI)",
  defaultBaseUrl: "",
  editableEndpoint: true,
  streamChat: streamOpenAiCompatible,
};

export const PROVIDERS: AiProvider[] = [openrouterProvider, customProvider];
export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id) ?? openrouterProvider;
