"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Paperclip, SendHorizontal, Square, X } from "lucide-react";
import { db } from "@/lib/db";
import { effectiveBaseUrl } from "@/lib/ai/settings";
import { LIMITS } from "@/lib/ai/context";
import { cn } from "@/lib/cn";
import { Button, IconButton, Modal } from "./ui";
import { useAiSettings } from "./use-ai-settings";
import type { ChatController } from "./use-chat";

export function Composer({ chat, activeSubjectId, onSubmitted }: { chat: ChatController; activeSubjectId: string | null; onSubmitted: () => void }) {
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const settings = useAiSettings();
  const subject = useLiveQuery(() => (activeSubjectId ? db.subjects.get(activeSubjectId).then((s) => s ?? null) : null), [activeSubjectId]);
  const notes = useLiveQuery(
    () => db.notes.toArray().then((all) => all.filter((n) => !activeSubjectId || n.subjectId === activeSubjectId).sort((a, b) => b.updatedAt - a.updatedAt)),
    [activeSubjectId],
  );
  const docs = useLiveQuery(
    () => db.documents.toArray().then((all) => all.filter((d) => d.status === "ok" && (!activeSubjectId || d.subjectId === activeSubjectId)).sort((a, b) => b.createdAt - a.createdAt)),
    [activeSubjectId],
  );
  const count = chat.selection.noteIds.length + chat.selection.docIds.length + chat.selection.excerpts.length + (chat.selection.useSubject && subject ? 1 : 0);
  let host = "";
  try { host = new URL(effectiveBaseUrl(settings)).host; } catch { /* endpoint inválido: mostra vazio */ }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || chat.streaming) return;
    setPickerOpen(false);
    const r = await chat.send(text);
    onSubmitted();
    if (r === "started") setDraft("");
  }

  const toggleNote = (id: string) =>
    chat.setSelection((s) => ({ ...s, noteIds: s.noteIds.includes(id) ? s.noteIds.filter((x) => x !== id) : [...s.noteIds, id] }));

  return (
    <>
      <form onSubmit={submit} className="border-t border-line bg-bg p-3 md:px-6">
        <div className="mx-auto max-w-3xl space-y-2">
          {pickerOpen && (
            <div className="fade-in max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line bg-surface p-3" role="group" aria-label="Contexto enviado à IA">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted">A IA só lê o que você marcar aqui.</p>
                <IconButton label="Fechar seleção de contexto" type="button" onClick={() => setPickerOpen(false)}><X className="size-4" /></IconButton>
              </div>
              {subject && (
                <label className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" className="accent-[var(--accent)]" checked={chat.selection.useSubject} onChange={(e) => chat.setSelection((s) => ({ ...s, useSubject: e.target.checked }))} />
                  Disciplina “{subject.name}” (nome e objetivos)
                </label>
              )}
              {docs && docs.map((d) => (
                <label key={d.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" className="accent-[var(--accent)]" checked={chat.selection.docIds.includes(d.id)} onChange={() => chat.toggleDoc(d.id)} />
                  <span className="truncate">Documento: {d.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{d.chars.toLocaleString("pt-BR")} caracteres{d.chars > LIMITS.perItem && " · será truncado"}</span>
                </label>
              ))}
              {chat.selection.excerpts.map((x) => (
                <div key={x.id} className="flex items-center gap-2 py-1 text-sm">
                  <span className="truncate">Trecho de {x.label}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{x.text.length.toLocaleString("pt-BR")} caracteres</span>
                  <IconButton type="button" label={`Remover trecho de ${x.label}`} onClick={() => chat.removeExcerpt(x.id)}><X className="size-3.5" /></IconButton>
                </div>
              ))}
              {notes === undefined ? null : notes.length === 0 ? (
                <p className="py-1 text-sm text-muted">Nenhuma anotação disponível{subject ? " nesta disciplina" : ""}.</p>
              ) : notes.map((n) => (
                <label key={n.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" className="accent-[var(--accent)]" checked={chat.selection.noteIds.includes(n.id)} onChange={() => toggleNote(n.id)} />
                  <span className="truncate">Anotação: {n.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{n.body.length.toLocaleString("pt-BR")} caracteres</span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 focus-within:border-accent">
            <button type="button" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}
              className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-surface-2", count ? "text-accent" : "text-muted")}>
              <Paperclip className="size-4" aria-hidden /> Contexto{count > 0 && ` (${count})`}
            </button>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Converse com a IA…" aria-label="Mensagem para a IA"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm placeholder:text-muted/70 focus:outline-none" />
            {chat.streaming ? (
              <IconButton label="Parar resposta" type="button" onClick={chat.stop} className="text-danger"><Square className="size-4" /></IconButton>
            ) : (
              <IconButton label="Enviar mensagem" type="submit" disabled={!draft.trim()} className="text-accent disabled:opacity-40"><SendHorizontal className="size-4" /></IconButton>
            )}
          </div>
          <p className="px-1 text-center text-xs text-muted">
            {settings.apiKey && settings.model ? `Mensagens vão para ${host || "o provedor"} · ${settings.model}` : "IA não configurada: o app funciona normalmente sem ela."}
          </p>
        </div>
      </form>

      <Modal open={!!chat.pending} onClose={chat.cancelPending} title="Confirmar envio à IA">
        {chat.pending && (
          <div className="space-y-3 text-sm">
            <p>Estes conteúdos serão enviados para <strong>{chat.pending.host}</strong> (modelo <strong>{chat.pending.model}</strong>). O provedor é externo e segue as próprias políticas de dados.</p>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              <li className="rounded-lg border border-line bg-surface-2 p-2"><span className="text-xs text-muted">Sua mensagem</span><p className="mt-0.5 whitespace-pre-wrap">{chat.pending.text}</p></li>
              {chat.pending.items.map((it, i) => (
                <li key={i} className="rounded-lg border border-line bg-surface-2 p-2">
                  <details>
                    <summary className="cursor-pointer">{it.label} <span className="text-xs text-muted">· {it.chars.toLocaleString("pt-BR")} caracteres{it.truncated && " (truncado)"}</span></summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted">{it.text}</pre>
                  </details>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">As mensagens anteriores desta conversa também são enviadas{chat.pending.dropped > 0 && ` (as ${chat.pending.dropped} mais antigas foram omitidas por limite)`}. Nada além disso é compartilhado.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={chat.cancelPending}>Cancelar</Button>
              <Button variant="primary" onClick={chat.confirmPending}>Enviar</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
