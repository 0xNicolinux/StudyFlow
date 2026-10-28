export type AISettings = {
  provider: "openrouter";
  apiKey: string;
  model: string;
  siteUrl: string;
  siteName: string;
};

const STORAGE_KEY = "studyflow.ai.settings";
export const DEFAULT_MODEL = "openrouter/auto";

export function getAISettings(): AISettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    if (parsed.provider !== "openrouter" || typeof parsed.apiKey !== "string" || !parsed.apiKey.trim()) return null;
    return {
      provider: "openrouter",
      apiKey: parsed.apiKey,
      model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL,
      siteUrl: typeof parsed.siteUrl === "string" ? parsed.siteUrl : "",
      siteName: typeof parsed.siteName === "string" ? parsed.siteName : "StudyFlow",
    };
  } catch {
    return null;
  }
}

export function saveAISettings(settings: AISettings) {
  if (typeof window === "undefined") throw new Error("Configuração disponível somente no navegador.");
  if (!settings.apiKey.trim()) throw new Error("Informe sua chave da OpenRouter.");
  if (!settings.model.trim()) throw new Error("Informe o modelo.");
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, apiKey: settings.apiKey.trim(), model: settings.model.trim() }));
}

export function clearAISettings() {
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function askOpenRouter(messages: ChatTurn[], options?: { signal?: AbortSignal }): Promise<string> {
  const settings = getAISettings();
  if (!settings) throw new Error("Configure sua chave da OpenRouter em Configurações → Inteligência artificial.");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey}`,
    "Content-Type": "application/json",
    "X-Title": settings.siteName || "StudyFlow",
  };
  if (settings.siteUrl) headers["HTTP-Referer"] = settings.siteUrl;
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      signal: options?.signal,
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: "Você é o assistente de estudos do StudyFlow. Responda em português brasileiro por padrão, com clareza, rigor e foco em aprendizagem. Quando útil, explique o raciocínio passo a passo e proponha exercícios; não invente fontes ou resultados." },
          ...messages,
        ],
        stream: false,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Não foi possível conectar à OpenRouter. Verifique sua conexão e tente novamente.");
  }
  const data = await response.json().catch(() => ({})) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  if (!response.ok) {
    const detail = data.error?.message;
    if (response.status === 401 || response.status === 403) throw new Error("Chave inválida ou sem permissão. Confira sua chave e os créditos na OpenRouter.");
    if (response.status === 429) throw new Error("Limite de requisições atingido. Aguarde ou confira os limites do provedor.");
    throw new Error(detail || `A OpenRouter retornou erro HTTP ${response.status}.`);
  }
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => part.text ?? "").join("") : "";
  if (!text.trim()) throw new Error("O modelo não retornou texto. Tente outro modelo nas configurações.");
  return text.trim();
}
