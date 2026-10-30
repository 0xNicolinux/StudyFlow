"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Library, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { buildContextItems, contextToText } from "@/lib/ai/context";
import type { GenerationKind } from "@/lib/ai/generation";
import { Button, Modal } from "./ui";

export type GenerationDialogRequest = { kind: GenerationKind; subjectId?: string };
export type GenerationDialogSubmit = { subjectId: string | null; requestText: string; contextText: string };

const LABEL: Record<GenerationKind, string> = {
  flashcards: "flashcards",
  quiz: "quiz",
  note: "anotação",
};

export function GenerationDialog({
  request,
  onClose,
  onSubmit,
  onOpenLibrary,
}: {
  request: GenerationDialogRequest;
  onClose: () => void;
  onSubmit: (input: GenerationDialogSubmit) => Promise<void>;
  onOpenLibrary: () => void;
}) {
  const [targetSubjectId, setTargetSubjectId] = useState(request.subjectId ?? "");
  const [includeSubject, setIncludeSubject] = useState(false);
  const [noteIds, setNoteIds] = useState<string[]>([]);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const subject = subjects?.find((item) => item.id === targetSubjectId) ?? null;
  const notes = useLiveQuery(
    () => db.notes.toArray().then((all) => all.filter((note) => !targetSubjectId || note.subjectId === targetSubjectId).sort((a, b) => b.updatedAt - a.updatedAt)),
    [targetSubjectId],
  );
  const docs = useLiveQuery(
    () => db.documents.toArray().then((all) => all.filter((doc) => doc.status === "ok" && (!targetSubjectId || doc.subjectId === targetSubjectId)).sort((a, b) => b.createdAt - a.createdAt)),
    [targetSubjectId],
  );

  useEffect(() => {
    setIncludeSubject(false);
    setNoteIds([]);
    setDocIds([]);
    setError(null);
  }, [targetSubjectId]);

  const hasSelectedContext = includeSubject || noteIds.length > 0 || docIds.length > 0;
  const title = request.kind === "flashcards" ? "Gerar flashcards com IA" : request.kind === "quiz" ? "Gerar quiz com IA" : "Gerar anotação com IA";

  function toggleId(id: string, selected: string[], update: (value: string[]) => void) {
    update(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!hasSelectedContext && !manual.trim()) {
      setError("Escolha algum material ou informe o assunto manualmente.");
      return;
    }
    if (!notes || !docs || !subjects) return;
    setSaving(true);
    setError(null);
    try {
      const selectedNotes = notes.filter((note) => noteIds.includes(note.id)).map((note) => ({ title: note.title, body: note.body }));
      const selectedDocs = docs.filter((doc) => docIds.includes(doc.id));
      const docTexts = await db.docTexts.bulkGet(selectedDocs.map((doc) => doc.id));
      const selectedDocuments = selectedDocs.map((doc, index) => ({ name: doc.name, text: docTexts[index]?.text ?? "" }));
      const items = buildContextItems({
        subject: includeSubject && subject ? { name: subject.name, goals: subject.goals } : null,
        notes: selectedNotes,
        documents: selectedDocuments,
      });
      const contextText = contextToText(items);
      const count = Number(quantity);
      const base = request.kind === "flashcards"
        ? `Crie ${count} flashcards com uma pergunta por cartão e respostas concisas.`
        : request.kind === "quiz"
          ? `Crie um quiz com ${count} questões de múltipla escolha, 4 alternativas quando apropriado e uma única resposta correta por questão.`
          : "Crie uma anotação de estudo completa, organizada e didática em Markdown.";
      const requestText = manual.trim() ? `${base}\\n\\nAssunto ou instruções do estudante:\\n${manual.trim()}` : `${base}\\n\\nUse os materiais selecionados como base principal.`;
      await onSubmit({ subjectId: targetSubjectId || null, requestText, contextText });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a geração.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title} wide>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <p className="text-muted">Escolha o contexto que a IA poderá usar. Nada é enviado sem sua seleção.</p>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Salvar em disciplina</span>
          <select value={targetSubjectId} onChange={(event) => setTargetSubjectId(event.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <option value="">Sem disciplina</option>
            {subjects?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-line bg-surface p-3">
          <p className="text-xs font-medium text-muted">Materiais disponíveis</p>
          {subject && (
            <label className="flex items-start gap-2 py-1">
              <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={includeSubject} onChange={(event) => setIncludeSubject(event.target.checked)} />
              <span><span className="block">{subject.name} — disciplina</span><span className="block text-xs text-muted">Nome e objetivos de estudo</span></span>
            </label>
          )}
          {docs === undefined || notes === undefined ? <p className="text-xs text-muted">Carregando materiais…</p> : (
            <>
              {docs.map((doc) => (
                <label key={doc.id} className="flex items-start gap-2 py-1">
                  <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={docIds.includes(doc.id)} onChange={() => toggleId(doc.id, docIds, setDocIds)} />
                  <span className="min-w-0 flex-1"><span className="block truncate">{doc.name}</span><span className="block text-xs text-muted">Documento · {doc.chars.toLocaleString("pt-BR")} caracteres{doc.truncated ? " · truncado" : ""}</span></span>
                </label>
              ))}
              {notes.map((note) => (
                <label key={note.id} className="flex items-start gap-2 py-1">
                  <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={noteIds.includes(note.id)} onChange={() => toggleId(note.id, noteIds, setNoteIds)} />
                  <span className="min-w-0 flex-1"><span className="block truncate">{note.title}</span><span className="block text-xs text-muted">Anotação · {note.body.length.toLocaleString("pt-BR")} caracteres</span></span>
                </label>
              ))}
              {docs.length === 0 && notes.length === 0 && !subject && <p className="text-xs text-muted">Nenhum material disponível nesta seleção.</p>}
            </>
          )}
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">{hasSelectedContext ? "Assunto ou instruções adicionais (opcional)" : "Qual assunto deseja estudar?"}</span>
          <textarea
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder={hasSelectedContext ? "Ex.: dê mais atenção aos conceitos e exemplos práticos…" : "Ex.: Programação orientada a objetos, com foco em herança e polimorfismo…"}
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed focus:border-accent focus:outline-none"
          />
        </label>

        {(request.kind === "flashcards" || request.kind === "quiz") && (
          <label className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted">{request.kind === "flashcards" ? "Quantidade de cartões" : "Quantidade de questões"}</span>
            <select value={quantity} onChange={(event) => setQuantity(event.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              {[5, 10, 15, 20].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}

        {!hasSelectedContext && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-secondary p-3">
            <p className="max-w-md text-xs text-muted">Também pode importar um PDF, TXT ou Markdown e selecioná-lo aqui depois.</p>
            <Button type="button" variant="ghost" onClick={onOpenLibrary}><Library className="size-4" aria-hidden /> Abrir biblioteca</Button>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving || !subjects || !notes || !docs}>
            <Sparkles className="size-4" aria-hidden /> {saving ? "Enfileirando…" : `Gerar ${LABEL[request.kind]} com IA`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
