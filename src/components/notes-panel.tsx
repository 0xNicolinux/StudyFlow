"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { createNote, deleteNote, updateNote } from "@/lib/repo";
import { cn } from "@/lib/cn";
import { Button, EmptyState, IconButton, Input, Loading } from "./ui";
import type { Note } from "@/lib/schemas";
import { useGeneration } from "./generation-provider";

export function NotesPanel({ subjectId }: { subjectId?: string }) {
  const notes = useLiveQuery(
    () => db.notes.toArray().then((all) => all.filter((n) => subjectId === undefined || n.subjectId === subjectId).sort((a, b) => b.updatedAt - a.updatedAt)),
    [subjectId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const generation = useGeneration();

  useEffect(() => {
    void generation.markKindViewed("note");
  }, [generation.jobs, generation.markKindViewed]);

  useEffect(() => {
    const target = generation.openTarget;
    if (target?.kind !== "note" || !notes?.some((note) => note.id === target.contentId)) return;
    setSelectedId(target.contentId);
    generation.clearOpenTarget();
  }, [generation.openTarget, generation.clearOpenTarget, notes]);
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
    <section aria-label="Anotações" className="notes-workspace grid gap-4 md:grid-cols-[14rem_1fr]">
      <div className="space-y-2">
        <Button onClick={add} className="w-full" variant="primary"><Plus className="size-4" aria-hidden /> Nova anotação</Button>
        <Button onClick={() => generation.openDialog("note", subjectId)} className="w-full" variant="ghost"><Sparkles className="size-4" aria-hidden /> Gerar com IA</Button>
        {notes === undefined ? <Loading /> : notes.length === 0 ? (
          <EmptyState title="Sem anotações" hint="Crie a primeira para começar." />
        ) : (
          <ul className="notes-list space-y-0.5">
            {notes.map((n) => (
              <li key={n.id} className={cn("notes-list-row group flex items-center rounded-lg", n.id === selectedId ? "is-selected" : "")}>
                <button onClick={() => setSelectedId(n.id)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm">{n.title}</button>
                <IconButton label={`Excluir ${n.title}`} onClick={() => remove(n)} className="opacity-0 focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"><Trash2 className="size-3.5" /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected ? <NoteEditor key={selected.id} note={selected} /> : (
        <div className="notes-empty hidden border border-line p-10 text-center text-sm text-muted md:block">Selecione ou crie uma anotação.</div>
      )}
    </section>
  );
}

function NoteEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const draft = useRef({ title: note.title, body: note.body });
  const persisted = useRef({ title: note.title, body: note.body });
  const queue = useRef<Promise<void>>(Promise.resolve());

  const persistDraft = useCallback((next: { title: string; body: string }) => {
    // Serializa gravações para que um autosave mais antigo não sobrescreva um rascunho mais novo.
    queue.current = queue.current.catch(() => undefined).then(async () => {
      await updateNote(note.id, { title: next.title.trim() || "Sem título", body: next.body });
      persisted.current = next;
    });
    return queue.current;
  }, [note.id]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const latest = draft.current;
      if (latest.title !== persisted.current.title || latest.body !== persisted.current.body) {
        // Ao trocar de anotação/tela, não descarta a última edição que ainda estava no debounce.
        void persistDraft(latest).catch(() => undefined);
      }
    };
  }, [persistDraft]);

  function schedule(next: { title: string; body: string }) {
    draft.current = next;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void persistDraft(next).then(() => {
        if (mounted.current) setStatus("saved");
      }).catch(() => {
        if (mounted.current) setStatus("error");
      });
    }, 500);
  }

  return (
    <div className="fade-in space-y-2">
      <div className="space-y-1">
        <Input
          value={title}
          onChange={(e) => {
            const nextTitle = e.target.value;
            setTitle(nextTitle);
            schedule({ title: nextTitle, body: draft.current.body });
          }}
          maxLength={200}
          aria-label="Título da anotação"
          className="text-base font-semibold"
        />
        <p className="text-right text-xs text-muted">{title.length}/200</p>
      </div>
      <div className="space-y-1">
        <textarea
          value={body}
          onChange={(e) => {
            const nextBody = e.target.value;
            setBody(nextBody);
            schedule({ title: draft.current.title, body: nextBody });
          }}
          maxLength={200000}
          aria-label="Conteúdo da anotação"
          placeholder="Escreva em Markdown…"
          className="min-h-[50vh] w-full resize-y rounded-xl border border-line bg-surface p-3 font-mono text-sm leading-relaxed focus:border-accent focus:outline-none"
        />
        <p className="text-right text-xs text-muted">{body.length.toLocaleString("pt-BR")}/200.000</p>
      </div>
      <p role="status" className={cn("text-xs", status === "error" ? "text-danger" : "text-muted")}>
        {status === "saved" ? "Salvo neste dispositivo" : status === "saving" ? "Salvando…" : "Erro ao salvar. Verifique o armazenamento do navegador."}
      </p>
    </div>
  );
}
