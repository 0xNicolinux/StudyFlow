"use client";
import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, ArrowLeft, MessageSquarePlus, RotateCcw, Settings, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { clearAllConversations } from "@/lib/repo";
import { Markdown } from "./markdown";
import { Button } from "./ui";
import type { ChatController } from "./use-chat";

export function ChatView({ chat, onBack, onOpenSettings }: { chat: ChatController; onBack: () => void; onOpenSettings: () => void }) {
  const messages = useLiveQuery(
    () => (chat.conversationId ? db.messages.where("conversationId").equals(chat.conversationId).sortBy("createdAt") : []),
    [chat.conversationId],
  );
  const conversations = useLiveQuery(() => db.conversations.toArray().then((a) => a.sort((x, y) => y.updatedAt - x.updatedAt)), []);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages?.length, chat.streamText]);

  // Entre gravar a resposta e encerrar o streaming há um instante em que ela existiria duas vezes na tela.
  const last = messages?.[messages.length - 1];
  const alreadySaved = !!chat.streamText && last?.role === "assistant" && last.content === chat.streamText;
  const needsSetup = chat.error?.kind === "no_key" || chat.error?.kind === "no_model" || chat.error?.kind === "auth";

  async function clearAll() {
    if (!window.confirm("Apagar TODAS as conversas com a IA deste dispositivo? Esta ação não pode ser desfeita.")) return;
    await clearAllConversations();
    chat.newConversation();
  }

  return (
    <div className="fade-in mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Voltar ao painel</Button>
        <Button variant="ghost" onClick={chat.newConversation} disabled={chat.streaming}><MessageSquarePlus className="size-4" aria-hidden /> Nova conversa</Button>
        {conversations && conversations.length > 0 && (
          <>
            <select aria-label="Conversas anteriores" value={chat.conversationId ?? ""} onChange={(e) => chat.setConversationId(e.target.value || null)} disabled={chat.streaming}
              className="max-w-48 rounded-lg border border-line bg-surface px-2 py-2 text-sm">
              <option value="">Conversas…</option>
              {conversations.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <Button variant="ghost" onClick={clearAll} disabled={chat.streaming}><Trash2 className="size-4" aria-hidden /> Limpar histórico</Button>
          </>
        )}
      </div>

      {messages === undefined ? null : messages.length === 0 && !chat.streaming && !chat.streamText && !chat.error ? (
        <p className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
          Faça uma pergunta abaixo. Use <strong className="text-fg">Contexto</strong> para escolher quais anotações a IA poderá ler — nada é enviado sem a sua seleção.
        </p>
      ) : (
        <ul className="space-y-3" aria-live="polite">
          {messages.map((m) =>
            m.role === "user" ? (
              <li key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/20 px-4 py-2.5 text-sm">{m.content}</li>
            ) : (
              <li key={m.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <Markdown>{m.content}</Markdown>
                {m.incomplete && <p className="mt-2 text-xs text-warning">Resposta incompleta: a conexão foi interrompida.</p>}
              </li>
            ),
          )}
          {(chat.streamText ? !alreadySaved : chat.streaming) && (
            <li className="rounded-2xl border border-line bg-surface px-4 py-3" aria-busy={chat.streaming}>
              {chat.streamText ? <Markdown>{chat.streamText}</Markdown> : <span className="text-sm text-muted">Pensando…</span>}
            </li>
          )}
        </ul>
      )}

      {chat.error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 flex-1 space-y-2">
            <p>{chat.error.message}</p>
            <div className="flex flex-wrap gap-2">
              {needsSetup && <Button onClick={onOpenSettings}><Settings className="size-4" aria-hidden /> Abrir configurações de IA</Button>}
              {!needsSetup && chat.conversationId && chat.error.kind !== "offline" && <Button onClick={chat.retry} disabled={chat.streaming}><RotateCcw className="size-4" aria-hidden /> Tentar novamente</Button>}
              <Button variant="ghost" onClick={chat.clearError}>Dispensar</Button>
            </div>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
