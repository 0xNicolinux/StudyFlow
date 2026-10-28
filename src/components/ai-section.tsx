"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { PROVIDERS, getProvider } from "@/lib/ai/openai-compatible";
import { AiSettingsSchema, clearApiKey, effectiveBaseUrl, fetchModels, saveSettings, validateBaseUrl, type ModelInfo } from "@/lib/ai/settings";
import { Button, Field, Input } from "./ui";
import { useAiSettings } from "./use-ai-settings";

type Msg = { ok: boolean; text: string } | null;

export function AiSection() {
  const saved = useAiSettings();
  const [resetN, setResetN] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  // O formulário só é recriado ao remover a chave; salvar não pode apagar a mensagem de confirmação.
  return (
    <AiForm
      key={resetN}
      initial={saved}
      msg={msg}
      setMsg={setMsg}
      onRemoveKey={() => { clearApiKey(); setResetN((n) => n + 1); setMsg({ ok: true, text: "Chave removida deste navegador." }); }}
    />
  );
}

function AiForm({ initial, msg, setMsg, onRemoveKey }: { initial: ReturnType<typeof useAiSettings>; msg: Msg; setMsg: (m: Msg) => void; onRemoveKey: () => void }) {
  const [s, setS] = useState(initial);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [freeOnly, setFreeOnly] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const provider = getProvider(s.provider);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const url = effectiveBaseUrl(s);
    const bad = validateBaseUrl(url);
    if (bad) return setMsg({ ok: false, text: bad });
    const ok = saveSettings(AiSettingsSchema.parse(s));
    setMsg(ok ? { ok: true, text: "Configuração salva neste navegador." } : { ok: false, text: "O navegador bloqueou o armazenamento local; a configuração não pôde ser salva." });
  }

  async function load() {
    setLoadingModels(true); setMsg(null);
    try { setModels(await fetchModels(s)); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao listar modelos." }); }
    finally { setLoadingModels(false); }
  }

  const shown = (models ?? []).filter((m) => !freeOnly || m.free);

  return (
    <form onSubmit={save} className="space-y-3">
      <h2 className="text-sm font-semibold">Inteligência artificial (opcional)</h2>
      <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          Sua chave fica salva <strong>em texto, neste navegador</strong> (localStorage), fora do backup. Qualquer extensão ou script com acesso a esta página poderia lê-la, e quem usar este dispositivo também.
          Use uma chave só para o StudyFlow, com limite de gasto baixo, e revogue-a no painel do provedor se suspeitar de vazamento.
        </p>
      </div>

      <Field label="Provedor">
        <select value={s.provider} onChange={(e) => { setS({ ...s, provider: e.target.value as typeof s.provider, baseUrl: "" }); setModels(null); }} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Field>

      {provider.editableEndpoint && (
        <Field label="Endpoint (URL base, ex.: https://host/v1)"><Input value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value })} placeholder="https://" autoComplete="off" /></Field>
      )}

      <Field label="Chave de API">
        <Input type="password" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value })} placeholder="sk-or-…" autoComplete="off" spellCheck={false} />
      </Field>

      <Field label="Modelo">
        <Input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} placeholder="ex.: provedor/nome-do-modelo" autoComplete="off" spellCheck={false} />
      </Field>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={load} disabled={loadingModels}>{loadingModels ? "Carregando…" : "Carregar lista de modelos"}</Button>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-[var(--accent)]" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Só gratuitos</label>
        </div>
        {models && (
          shown.length === 0 ? <p className="text-sm text-muted">Nenhum modelo{freeOnly ? " gratuito" : ""} encontrado. Disponibilidade e preços mudam; confirme no site do provedor.</p> : (
            <select aria-label="Modelos disponíveis" value="" onChange={(e) => e.target.value && setS({ ...s, model: e.target.value })} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <option value="">Escolher entre {shown.length} modelos…</option>
              {shown.map((m) => <option key={m.id} value={m.id}>{m.id}{m.free ? " (gratuito)" : ""}</option>)}
            </select>
          )
        )}
        <p className="text-xs text-muted">Gratuidade, limites e disponibilidade dos modelos podem mudar a qualquer momento; o app apenas reflete o que o provedor informa.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary">Salvar configuração de IA</Button>
        {initial.apiKey && <Button type="button" variant="danger" onClick={onRemoveKey}>Remover chave</Button>}
      </div>
      {msg && <p role="status" className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</p>}
    </form>
  );
}
