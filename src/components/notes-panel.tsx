"use client";
import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { createNote, deleteNote, updateNote } from "@/lib/repo";
import { cn } from "@/lib/cn";
import { Button, EmptyState, IconButton, Input, Loading } from "./ui";
import type { Note } from "@/lib/schemas";

export function NotesPanel({ subjectId }: { subjectId?: string }) {
  const notes = useLiveQuery(
    () => db.notes.toArray().then((all) => all.filter((n) => subjectId === undefined || n.subjectId === subjectId).sort((a, b) => b.updatedAt - a.updatedAt)),
    [subjectId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = notes?.find((n) => n.id === selectedId) ?? null;

  async function add() {
    const n = await createNote({ title: "Nova anotação", subjectId: subjectId ?? null });
    setSelectedId(n.id);
  }

  async function remove(n: Note) {
    if (!window.confirm(`Excluir a anotação "${n.title}"?`)) return;
    await deleteNote(n.id);
    if (selectedId === n.id) setSelectedId(null);
  }

  return (
    <section aria-label="Anotações" className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <div className="space-y-2">
        <Button onClick={add} className="w-full" variant="primary"><Plus className="size-4" aria-hidden /> Nova anotação</Button>
        {notes === undefined ? <Loading /> : notes.length === 0 ? (
          <EmptyState title="Sem anotações" hint="Crie a primeira para começar." />
        ) : (
          <ul className="space-y-0.5">
            {notes.map((n) => (
              <li key={n.id} className={cn("group flex items-center rounded-lg", n.id === selectedId ? "bg-surface-3" : "hover:bg-surface-2")}>
                <button onClick={() => setSelectedId(n.id)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm">{n.title}</button>
                <IconButton label={`Excluir ${n.title}`} onClick={() => remove(n)} className="opacity-0 focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"><Trash2 className="size-3.5" /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected ? <NoteEditor key={selected.id} note={selected} /> : (
        <div className="hidden rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted md:block">Selecione ou crie uma anotação.</div>
      )}
    </section>
  );
}

function NoteEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function schedule(next: { title: string; body: string }) {
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await updateNote(note.id, { title: next.title.trim() || "Sem título", body: next.body });
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 500);
  }

  return (
    <div className="fade-in space-y-2">
      <Input value={title} onChange={(e) => { setTitle(e.target.value); schedule({ title: e.target.value, body }); }} aria-label="Título da anotação" className="text-base font-semibold" />
      <textarea
        value={body}
        onChange={(e) => { setBody(e.target.value); schedule({ title, body: e.target.value }); }}
        aria-label="Conteúdo da anotação"
        placeholder="Escreva em Markdown…"
        className="min-h-[50vh] w-full resize-y rounded-xl border border-line bg-surface p-3 font-mono text-sm leading-relaxed focus:border-accent focus:outline-none"
      />
      <p role="status" className={cn("text-xs", status === "error" ? "text-danger" : "text-muted")}>
        {status === "saved" ? "Salvo neste dispositivo" : status === "saving" ? "Salvando…" : "Erro ao salvar. Verifique o armazenamento do navegador."}
      </p>
    </div>
  );
}
