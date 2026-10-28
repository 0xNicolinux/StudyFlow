import { AiError, type AiProvider, type StreamRequest } from "./types";

const joinUrl = (base: string, path: string) => base.replace(/\/+$/, "") + path;

/** Converte uma resposta HTTP de erro em um AiError com mensagem útil. Nunca inclui a chave. */
export async function errorFromResponse(res: Response): Promise<AiError> {
  let detail = "";
  try {
    const j = await res.json();
    const m = j?.error?.message;
    if (typeof m === "string") detail = m.slice(0, 300);
  } catch { /* corpo não é JSON */ }
  const extra = detail ? ` (${detail})` : "";
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

export async function* streamOpenAiCompatible(req: StreamRequest): AsyncGenerator<string, void, void> {
  const f = req.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(joinUrl(req.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${req.apiKey}` },
      body: JSON.stringify({ model: req.model, messages: req.messages, stream: true }),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new AiError("aborted", "Resposta interrompida.");
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new AiError(offline ? "offline" : "network", offline ? "Você está sem internet. A IA remota está indisponível, mas seus dados locais continuam acessíveis." : "Não foi possível alcançar o provedor. Verifique sua conexão e o endpoint.");
  }
  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) throw new AiError("stream", "O provedor não enviou uma resposta em streaming.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line || line.startsWith(":")) continue; // comentários/keep-alive SSE
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let obj: { error?: { message?: string }; choices?: { delta?: { content?: unknown } }[] };
        try { obj = JSON.parse(data); } catch { continue; }
        if (obj.error) throw new AiError("stream", `O provedor interrompeu a resposta: ${String(obj.error.message ?? "erro desconhecido").slice(0, 200)}`);
        const delta = obj.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      }
    }
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
