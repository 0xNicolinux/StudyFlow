import { z } from "zod";
import { AiError } from "./types";
import { getProvider } from "./openai-compatible";

const KEY = "studyflow.ai.v1";

export const AiSettingsSchema = z.object({
  provider: z.enum(["openrouter", "custom"]).default("openrouter"),
  baseUrl: z.string().default(""),
  model: z.string().trim().default(""),
  apiKey: z.string().default(""),
  consentGiven: z.boolean().default(false),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;
export const DEFAULT_SETTINGS: AiSettings = AiSettingsSchema.parse({});

// Armazenamento injetável (testes) com falha silenciosa quando o navegador bloqueia.
export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
let store: KV | null = null;
const kv = (): KV | null => {
  if (store) return store;
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
};
export const __setStore = (s: KV | null) => { store = s; };

/** Configuração de IA fica FORA do IndexedDB: não entra no backup e não depende dos dados de estudo. */
export function loadSettings(): AiSettings {
  try {
    const raw = kv()?.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = AiSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export const SETTINGS_EVENT = "studyflow:ai-settings";

export function saveSettings(s: AiSettings): boolean {
  try {
    kv()?.setItem(KEY, JSON.stringify(AiSettingsSchema.parse(s)));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SETTINGS_EVENT));
    return !!kv();
  } catch { return false; }
}

export function clearApiKey() {
  saveSettings({ ...loadSettings(), apiKey: "" });
}

export const effectiveBaseUrl = (s: AiSettings) => (s.baseUrl.trim() || getProvider(s.provider).defaultBaseUrl).replace(/\/+$/, "");

export function validateBaseUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return "Use um endereço https:// (http só é aceito para localhost).";
    return null;
  } catch { return "Endereço inválido."; }
}

/** Garante que há tudo para uma chamada real; caso contrário lança AiError ANTES de qualquer requisição. */
export function assertReady(s: AiSettings): { baseUrl: string; apiKey: string; model: string } {
  if (!s.apiKey.trim()) throw new AiError("no_key", "Nenhuma chave de API configurada. Abra Configurações para adicionar a sua.");
  if (!s.model.trim()) throw new AiError("no_model", "Nenhum modelo escolhido. Defina o modelo em Configurações.");
  const baseUrl = effectiveBaseUrl(s);
  const bad = validateBaseUrl(baseUrl);
  if (bad) throw new AiError("bad_request", bad);
  return { baseUrl, apiKey: s.apiKey.trim(), model: s.model.trim() };
}

export type ModelInfo = { id: string; free: boolean };

/** Lista modelos do provedor (no OpenRouter o endpoint é público). "free" = preço zero de prompt e resposta. */
export async function fetchModels(s: AiSettings, f: typeof fetch = fetch): Promise<ModelInfo[]> {
  const base = effectiveBaseUrl(s);
  const bad = validateBaseUrl(base);
  if (bad) throw new AiError("bad_request", bad);
  const headers: Record<string, string> = {};
  if (s.provider !== "openrouter" && s.apiKey) headers.Authorization = `Bearer ${s.apiKey}`;
  let res: Response;
  try { res = await f(`${base}/models`, { headers }); }
  catch { throw new AiError("network", "Não foi possível carregar a lista de modelos. Você pode digitar o nome do modelo manualmente."); }
  if (!res.ok) throw new AiError("bad_request", `Não foi possível listar modelos (HTTP ${res.status}). Digite o modelo manualmente.`);
  const j = await res.json().catch(() => null);
  const arr: unknown[] = Array.isArray(j?.data) ? j.data : [];
  return arr
    .map((m) => {
      const o = m as { id?: unknown; pricing?: { prompt?: unknown; completion?: unknown } };
      if (typeof o.id !== "string") return null;
      const free = Number(o.pricing?.prompt) === 0 && Number(o.pricing?.completion) === 0 && o.pricing?.prompt !== undefined;
      return { id: o.id, free };
    })
    .filter((m): m is ModelInfo => m !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}
