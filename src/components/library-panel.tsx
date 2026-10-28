"use client";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, FileText, FileType2, Info, Search, Trash2, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { ACCEPT, deleteDocument, formatBytes, importFile, moveDocument, searchDocuments, type SearchHit } from "@/lib/docs";
import { LIMITS } from "@/lib/ai/context";
import { cn } from "@/lib/cn";
import { Button, EmptyState, Input, Loading, Modal } from "./ui";
import { Markdown } from "./markdown";
import { useChatContext } from "./chat-context";
import type { StudyDocument } from "@/lib/schemas";

export function LibraryPanel({ subjectId }: { subjectId?: string }) {
  const docs = useLiveQuery(
    () => db.documents.toArray().then((a) => a.filter((d) => subjectId === undefined || d.subjectId === subjectId).sort((x, y) => y.createdAt - x.createdAt)),
    [subjectId],
  );
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [okCount, setOkCount] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!docs || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => { const r = await searchDocuments(query, docs); if (!cancelled) setHits(r); }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, docs]);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setErrors([]); setOkCount(null);
    let ok = 0; const errs: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setBusy(`Importando ${i + 1} de ${list.length}: ${list[i].name}…`);
      const r = await importFile(list[i], subjectId ?? null);
      if (r.ok) ok++; else errs.push(r.error);
    }
    setBusy(null); setErrors(errs); setOkCount(ok);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!docs || !subjects) return <Loading />;
  const searching = query.trim().length >= 2;
  const shown: SearchHit[] = searching ? (hits ?? []) : docs.map((doc) => ({ doc, snippet: null }));
  const subj = (id: string | null) => subjects.find((s) => s.id === id);

  return (
    <section aria-label="Biblioteca de materiais" className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
        className={cn("flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4 transition-colors", dragging ? "border-accent bg-accent/10" : "border-line bg-surface")}
      >
        <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={!!busy}><Upload className="size-4" aria-hidden /> Importar arquivos</Button>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Selecionar arquivos" onChange={(e) => e.target.files && void addFiles(e.target.files)} />
        <p className="text-sm text-muted">PDF, TXT ou Markdown, até 30 MB cada. Arraste para cá ou escolha os arquivos. Ficam só neste dispositivo.</p>
      </div>

      {busy && <p role="status" className="text-sm text-muted">{busy}</p>}
      {okCount !== null && okCount > 0 && errors.length === 0 && <p role="status" className="text-sm text-success">{okCount} arquivo(s) importado(s).</p>}
      {errors.length > 0 && (
        <div role="alert" className="space-y-1 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-danger" aria-hidden /> {okCount ? `${okCount} importado(s); ` : ""}{errors.length} não importado(s):</p>
          <ul className="list-disc space-y-0.5 pl-9">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          <Button variant="ghost" onClick={() => setErrors([])}>Dispensar</Button>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim().length < 2) setHits(null); }} placeholder="Pesquisar por nome ou conteúdo…" aria-label="Pesquisar materiais" className="pl-9" />
      </div>

      {docs.length === 0 ? <EmptyState title="Nenhum material ainda" hint="Importe PDFs, TXT ou Markdown para consultar e usar como contexto da IA — só quando você escolher." />
        : searching && hits === null ? <Loading label="Pesquisando…" />
        : shown.length === 0 ? <p className="text-sm text-muted">Nada encontrado para “{query}”.</p>
        : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {shown.map(({ doc, snippet }) => (
              <li key={doc.id}>
                <button onClick={() => setOpenId(doc.id)} className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2">
                  {doc.kind === "pdf" ? <FileType2 className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden /> : <FileText className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{doc.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                      <span>{doc.kind.toUpperCase()} · {formatBytes(doc.size)}{doc.pages ? ` · ${doc.pages} pág.` : ""}</span>
                      <span>{new Date(doc.createdAt).toLocaleDateString("pt-BR")}</span>
                      {subjectId === undefined && subj(doc.subjectId) && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: subj(doc.subjectId)!.color }} aria-hidden />{subj(doc.subjectId)!.name}</span>}
                      {doc.status === "error" && <span className="text-danger">Falha na extração</span>}
                      {doc.status === "empty" && <span className="text-warning">Sem texto extraível</span>}
                      {doc.truncated && <span className="text-warning">Texto truncado</span>}
                      {!doc.hasOriginal && <span className="text-warning">Original ausente</span>}
                    </span>
                    {snippet && <span className="mt-1 block text-xs text-muted">{snippet}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

      <Viewer doc={docs.find((d) => d.id === openId) ?? null} subjects={subjects} onClose={() => setOpenId(null)} />
    </section>
  );
}

function Viewer({ doc, subjects, onClose }: { doc: StudyDocument | null; subjects: import("@/lib/schemas").Subject[]; onClose: () => void }) {
  return (
    <Modal open={!!doc} onClose={onClose} title={doc?.name ?? "Material"} wide>
      {doc && <ViewerBody key={doc.id} doc={doc} subjects={subjects} onClose={onClose} />}
    </Modal>
  );
}

function ViewerBody({ doc, subjects, onClose }: { doc: StudyDocument; subjects: import("@/lib/schemas").Subject[]; onClose: () => void }) {
  const chat = useChatContext();
  const text = useLiveQuery(() => db.docTexts.get(doc.id).then((t) => t?.text ?? ""), [doc.id]);
  const [selected, setSelected] = useState("");
  const [added, setAdded] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const inContext = chat?.selection.docIds.includes(doc.id) ?? false;

  async function openOriginal() {
    const f = await db.docFiles.get(doc.id);
    if (!f) return;
    const url = URL.createObjectURL(f.blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function captureSelection() {
    const sel = window.getSelection();
    const pre = preRef.current;
    const inside = !!sel && sel.rangeCount > 0 && !!pre && pre.contains(sel.anchorNode) && pre.contains(sel.focusNode);
    setSelected(inside ? sel!.toString().trim() : ""); setAdded(false);
  }

  async function remove() {
    if (!window.confirm(`Excluir “${doc.name}”? O arquivo original e o texto extraído serão apagados deste dispositivo.`)) return;
    await deleteDocument(doc.id); onClose();
  }

  return (
    <div className="space-y-4 text-sm">
      <section aria-label="Arquivo original" className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><FileType2 className="size-3.5 shrink-0" aria-hidden /> Arquivo original</h3>
        <p>{doc.name} · {doc.kind.toUpperCase()} · {formatBytes(doc.size)}{doc.pages ? ` · ${doc.pages} páginas` : ""} · importado em {new Date(doc.createdAt).toLocaleDateString("pt-BR")}</p>
        {doc.hasOriginal ? <Button onClick={openOriginal}>Abrir original em nova aba</Button>
          : <p className="flex items-start gap-2 text-warning"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /> O arquivo original não está neste dispositivo (o backup foi feito sem arquivos). Só o texto extraído foi restaurado.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted" htmlFor={`subj-${doc.id}`}>Disciplina</label>
          <select id={`subj-${doc.id}`} value={doc.subjectId ?? ""} onChange={(e) => void moveDocument(doc.id, e.target.value || null)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
            <option value="">Sem disciplina</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button variant="danger" className="ml-auto" onClick={remove}><Trash2 className="size-4" aria-hidden /> Excluir material</Button>
        </div>
      </section>

      <section aria-label="Texto extraído" className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><FileText className="size-3.5 shrink-0" aria-hidden /> Texto extraído</h3>
        <p className="text-xs text-muted">{doc.chars.toLocaleString("pt-BR")} caracteres — gerado automaticamente a partir do original; pode conter erros de formatação.</p>
        {doc.status !== "ok" && <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {doc.error}</p>}
        {doc.truncated && <p className="flex items-start gap-2 text-warning"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /> O documento é muito grande; apenas o início foi extraído e guardado.</p>}
        {text === undefined ? <Loading /> : text ? (
          <>
            {doc.kind === "md" && <details className="rounded-lg border border-line"><summary className="cursor-pointer px-3 py-2">Ver renderizado (Markdown)</summary><div className="max-h-72 overflow-auto p-3"><Markdown>{text.slice(0, 50_000)}</Markdown></div></details>}
            <pre ref={preRef} onMouseUp={captureSelection} onKeyUp={captureSelection} tabIndex={0} aria-label="Texto extraído do documento" className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed">{text.slice(0, 200_000)}{text.length > 200_000 && "\n\n[…exibição limitada aos primeiros 200.000 caracteres…]"}</pre>
          </>
        ) : null}
      </section>

      {doc.status === "ok" && chat && (
        <section aria-label="Contexto da IA" className="space-y-2 rounded-xl border border-line p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Usar com a IA</h3>
          <p className="text-muted">Nada é enviado agora. O que você marcar aparece em “Contexto” no chat e só é enviado após você confirmar.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => chat.toggleDoc(doc.id)} variant={inContext ? "primary" : "subtle"}>{inContext ? "Documento no contexto ✓" : "Adicionar documento ao contexto"}</Button>
            <Button disabled={!selected} onClick={() => { chat.addExcerpt(doc.name, selected.slice(0, LIMITS.perItem)); setAdded(true); }}>Adicionar trecho selecionado</Button>
            {added && <span role="status" className="text-success">Trecho adicionado.</span>}
          </div>
          {doc.chars > LIMITS.perItem && <p className="text-xs text-warning">Este documento tem mais de {LIMITS.perItem.toLocaleString("pt-BR")} caracteres: se enviado inteiro, só o início segue. Selecione um trecho no texto acima para enviar a parte certa.</p>}
          {!selected && <p className="text-xs text-muted">Dica: selecione com o mouse um trecho do texto extraído para habilitar o botão de trecho.</p>}
        </section>
      )}
    </div>
  );
}
