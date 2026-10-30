"use client";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Play, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { createFlashcard, deleteFlashcard, reviewFlashcard, updateFlashcard } from "@/lib/study-repo";
import { GRADE_LABELS, previewLabel, type Grade } from "@/lib/srs";
import { dueCount, retention } from "@/lib/stats";
import { useNow } from "./use-now";
import { Button, EmptyState, Field, IconButton, Loading, Modal } from "./ui";
import type { Flashcard } from "@/lib/schemas";

const textarea = "w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none";

export function FlashcardsPanel({ subjectId }: { subjectId?: string }) {
  const cards = useLiveQuery(() => db.flashcards.toArray().then((a) => a.filter((c) => subjectId === undefined || c.subjectId === subjectId)), [subjectId]);
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const [reviewing, setReviewing] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const now = useNow();

  if (!cards || !subjects) return <Loading />;
  const due = cards.filter((c) => c.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
  const ret = retention(cards);

  if (reviewing) return <Review ids={reviewing} onExit={() => setReviewing(null)} />;

  return (
    <section aria-label="Flashcards" className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="study-stat rounded-lg border border-line bg-surface px-3 py-2.5 text-sm"><span className="text-muted">Cartões </span><strong className="tabular-nums">{cards.length}</strong></div>
        <div className="study-stat rounded-lg border border-line bg-surface px-3 py-2 text-sm"><span className="text-muted">Para revisar </span><strong className="tabular-nums">{dueCount(cards, now)}</strong></div>
        <div className="study-stat rounded-lg border border-line bg-surface px-3 py-2 text-sm"><span className="text-muted">Acertos nas revisões </span><strong className="tabular-nums">{ret === null ? "—" : `${ret}%`}</strong></div>
        <Button variant="primary" className="ml-auto min-h-10 px-4" disabled={due.length === 0} onClick={() => setReviewing(due.map((c) => c.id))}><Play className="size-4" aria-hidden /> Revisar{due.length > 0 && ` (${due.length})`}</Button>
      </div>

      <CardForm key={cards.length} subjectId={subjectId} subjects={subjects} />

      {cards.length === 0 ? <EmptyState title="Nenhum cartão ainda" hint="Crie cartões com pergunta e resposta; o app agenda as revisões para você." /> : (
        <ul className="study-rows divide-y divide-line rounded-lg border border-line bg-surface">
          {cards.slice().sort((a, b) => a.dueAt - b.dueAt).map((c) => (
            <li key={c.id} className="study-row flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{c.front}</p>
                <p className="text-xs text-muted">{c.dueAt <= now ? "Para revisar agora" : `Próxima revisão: ${new Date(c.dueAt).toLocaleDateString("pt-BR")}`}{subjectId === undefined && subjects.find((s) => s.id === c.subjectId) && ` · ${subjects.find((s) => s.id === c.subjectId)!.name}`}</p>
              </div>
              <IconButton label={`Editar cartão ${c.front}`} onClick={() => setEditing(c)}><Pencil className="size-4" /></IconButton>
              <IconButton label={`Excluir cartão ${c.front}`} onClick={() => { if (window.confirm("Excluir este cartão?")) void deleteFlashcard(c.id); }}><Trash2 className="size-4" /></IconButton>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar cartão">
        {editing && <EditForm card={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </section>
  );
}

function CardForm({ subjectId, subjects }: { subjectId?: string; subjects: import("@/lib/schemas").Subject[] }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [target, setTarget] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try { await createFlashcard({ subjectId: subjectId ?? (target || null), front, back }); setFront(""); setBack(""); setErr(null); }
    catch { setErr("Preencha a frente e o verso do cartão."); }
  }
  return (
    <form onSubmit={add} className="study-create-form space-y-4 rounded-xl border border-line bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <textarea className={textarea} rows={3} value={front} onChange={(e) => setFront(e.target.value)} placeholder="Frente (pergunta)" aria-label="Frente do cartão" maxLength={2000} />
        <textarea className={textarea} rows={2} value={back} onChange={(e) => setBack(e.target.value)} placeholder="Verso (resposta)" aria-label="Verso do cartão" maxLength={4000} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {subjectId === undefined && (
          <select aria-label="Disciplina do cartão" value={target} onChange={(e) => setTarget(e.target.value)} className="min-h-10 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <option value="">Sem disciplina</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <Button type="submit" variant="primary" className="min-h-10 px-4">Adicionar cartão</Button>
        {err && <span role="alert" className="text-xs text-danger">{err}</span>}
      </div>
    </form>
  );
}

function EditForm({ card, onDone }: { card: Flashcard; onDone: () => void }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) { e.preventDefault(); try { await updateFlashcard(card.id, { front, back }); onDone(); } catch { setErr("Preencha a frente e o verso."); } }
  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Frente"><textarea className={textarea} rows={3} value={front} onChange={(e) => setFront(e.target.value)} maxLength={2000} /></Field>
      <Field label={`Verso (${back.length}/4000)`} error={err}><textarea className={textarea} rows={4} value={back} onChange={(e) => setBack(e.target.value)} maxLength={4000} /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button><Button type="submit" variant="primary">Salvar</Button></div>
    </form>
  );
}

function Review({ ids, onExit }: { ids: string[]; onExit: () => void }) {
  const [queue, setQueue] = useState(ids);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const [requeued, setRequeued] = useState<Set<string>>(new Set());
  const card = useLiveQuery(() => (queue[0] ? db.flashcards.get(queue[0]).then((c) => c ?? null) : null), [queue[0]]);

  const busy = useRef(false);

  async function grade(g: Grade) {
    // Evita avaliar o mesmo cartão duas vezes (tecla segurada ou duplo clique enquanto a gravação termina).
    if (!card || busy.current) return;
    busy.current = true;
    try { await reviewFlashcard(card.id, g); } finally { busy.current = false; }
    setDone((n) => n + 1);
    // Um cartão errado volta uma vez ao fim da sessão.
    const again = g === 0 && !requeued.has(card.id);
    if (again) setRequeued(new Set(requeued).add(card.id));
    setQueue((q) => [...q.slice(1), ...(again ? [card.id] : [])]);
    setShown(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key === " " || e.key === "Enter") { if (!shown && card) { e.preventDefault(); setShown(true); } }
      else if (shown && ["1", "2", "3", "4"].includes(e.key)) void grade((Number(e.key) - 1) as Grade);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (queue.length === 0) {
    return (
      <div className="fade-in space-y-3 rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="text-lg font-semibold">Revisão concluída</p>
        <p className="text-sm text-muted">Você avaliou {done} {done === 1 ? "cartão" : "cartões"}.</p>
        <Button variant="primary" onClick={onExit}>Voltar aos cartões</Button>
      </div>
    );
  }
  if (card === undefined) return <Loading />;
  if (card === null) return <div className="space-y-3"><p className="text-sm text-muted">Este cartão foi removido.</p><Button onClick={() => setQueue((q) => q.slice(1))}>Continuar</Button></div>;

  return (
    <div className="fade-in mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm text-muted"><span>{queue.length} restante(s)</span><Button variant="ghost" onClick={onExit}>Sair da revisão</Button></div>
      <div className="min-h-48 rounded-2xl border border-line bg-surface p-6">
        <p className="text-xs font-medium text-muted">Pergunta</p>
        <p className="mt-1 whitespace-pre-wrap text-lg">{card.front}</p>
        {shown && (<><hr className="my-4 border-line" /><p className="text-xs font-medium text-muted">Resposta</p><p className="mt-1 whitespace-pre-wrap">{card.back}</p></>)}
      </div>
      {!shown ? <Button variant="primary" className="w-full" onClick={() => setShown(true)}>Mostrar resposta <kbd className="ml-1 text-xs opacity-70">Espaço</kbd></Button> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([0, 1, 2, 3] as Grade[]).map((g) => (
            <Button key={g} variant={g === 0 ? "danger" : "subtle"} onClick={() => grade(g)} className="flex-col gap-0.5 py-2.5">
              <span>{GRADE_LABELS[g]} <kbd className="text-xs opacity-60">{g + 1}</kbd></span>
              <span className="text-xs font-normal text-muted">{previewLabel(card, g)}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
