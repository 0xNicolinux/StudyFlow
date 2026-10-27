"use client";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "./ui";

export type ChatMessage = { id: string; role: "user" | "notice"; text: string };

/**
 * Etapa 2: apenas a casca do chat. Nenhuma chamada de IA é feita nesta versão,
 * e a interface não simula respostas. A integração real é a Etapa 6.
 */
export function ChatView({ messages, onBack }: { messages: ChatMessage[]; onBack: () => void }) {
  return (
    <div className="fade-in mx-auto flex max-w-3xl flex-col gap-3">
      <div><Button variant="ghost" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Voltar ao painel</Button></div>
      <ul className="space-y-3" aria-live="polite">
        {messages.map((m) =>
          m.role === "user" ? (
            <li key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/20 px-4 py-2.5 text-sm">{m.text}</li>
          ) : (
            <li key={m.id} className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> <span>{m.text}</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
