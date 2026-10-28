import { db } from "./db";
import { DocumentSchema, type StudyDocument } from "./schemas";

export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_PDF_PAGES = 400;
export const MAX_TEXT_CHARS = 2_000_000;

export type DocKind = "pdf" | "txt" | "md";
const EXT: Record<string, DocKind> = { pdf: "pdf", txt: "txt", md: "md", markdown: "md" };
export const ACCEPT = ".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown";

export const kindOfName = (name: string): DocKind | null => EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;

/** Valida nome, tamanho e conteúdo inicial. Nada inválido chega ao armazenamento. */
export function validateFile(name: string, size: number, head: Uint8Array): { ok: true; kind: DocKind } | { ok: false; error: string } {
  const kind = kindOfName(name);
  if (!kind) return { ok: false, error: `“${name}”: formato não suportado. Use PDF, TXT ou Markdown.` };
  if (size === 0) return { ok: false, error: `“${name}”: o arquivo está vazio.` };
  if (size > MAX_FILE_BYTES) return { ok: false, error: `“${name}”: maior que ${MAX_FILE_BYTES / 1024 / 1024} MB (limite para guardar no navegador).` };
  if (kind === "pdf") {
    const magic = String.fromCharCode(...head.slice(0, 5));
    if (magic !== "%PDF-") return { ok: false, error: `“${name}”: não parece ser um PDF válido.` };
  } else if (head.includes(0)) {
    return { ok: false, error: `“${name}”: o conteúdo é binário, não texto.` };
  }
  return { ok: true, kind };
}

export type Extraction = { status: "ok" | "empty" | "error"; text: string; pages: number | null; truncated: boolean; error: string | null };

export function decodeText(bytes: Uint8Array): string {
  let t: string;
  try { t = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { t = new TextDecoder("windows-1252").decode(bytes); } // arquivos antigos em português
  return t.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export function extractPlain(bytes: Uint8Array): Extraction {
  let text = decodeText(bytes);
  const truncated = text.length > MAX_TEXT_CHARS;
  if (truncated) text = text.slice(0, MAX_TEXT_CHARS);
  if (!text.trim()) return { status: "empty", text: "", pages: null, truncated: false, error: "O arquivo só contém espaços em branco." };
  return { status: "ok", text, pages: null, truncated, error: null };
}

// Subconjunto do pdfjs-dist de que precisamos (permite injetar a build correta no navegador ou nos testes).
type PdfLib = { getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDoc> } };
type PdfDoc = { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>; destroy(): Promise<void> | void };

export async function extractPdf(lib: PdfLib, bytes: Uint8Array): Promise<Extraction> {
  let pdf: PdfDoc | null = null;
  try {
    pdf = await lib.getDocument({ data: bytes.slice() }).promise; // pdfjs consome o buffer: passamos uma cópia
    const pages = pdf.numPages;
    const last = Math.min(pages, MAX_PDF_PAGES);
    const parts: string[] = [];
    let chars = 0;
    let truncated = pages > MAX_PDF_PAGES;
    for (let n = 1; n <= last; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      let page = "";
      for (const it of content.items as { str?: string; hasEOL?: boolean }[]) {
        if (typeof it.str !== "string") continue;
        page += it.str + (it.hasEOL ? "\n" : " ");
      }
      page = page.replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();
      if (chars + page.length > MAX_TEXT_CHARS) { parts.push(page.slice(0, MAX_TEXT_CHARS - chars)); truncated = true; break; }
      parts.push(page); chars += page.length + 2;
    }
    const text = parts.join("\n\n").trim();
    if (!text) return { status: "empty", text: "", pages, truncated: false, error: "Este PDF não tem texto selecionável (talvez seja escaneado). Reconhecimento de texto em imagens (OCR) não é suportado." };
    return { status: "ok", text, pages, truncated, error: null };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    const error =
      name === "PasswordException" ? "O PDF é protegido por senha; não foi possível extrair o texto."
      : name === "InvalidPDFException" ? "O PDF está corrompido ou é inválido; não foi possível extrair o texto."
      : "Falha ao extrair o texto do PDF.";
    return { status: "error", text: "", pages: null, truncated: false, error };
  } finally {
    try { await pdf?.destroy(); } catch { /* ignora */ }
  }
}

let pdfLibPromise: Promise<PdfLib> | null = null;
/** Carrega o pdfjs só no navegador e só quando necessário (não entra no carregamento inicial). */
export function loadPdfLib(): Promise<PdfLib> {
  pdfLibPromise ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return lib as unknown as PdfLib;
  });
  return pdfLibPromise;
}

export type ImportResult = { ok: true; doc: StudyDocument } | { ok: false; error: string };

export async function importFile(file: File, subjectId: string | null, lib: () => Promise<PdfLib> = loadPdfLib): Promise<ImportResult> {
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch { return { ok: false, error: `“${file.name}”: não foi possível ler o arquivo.` }; }
  const v = validateFile(file.name, file.size, bytes.slice(0, 1024));
  if (!v.ok) return v;

  let ex: Extraction;
  if (v.kind === "pdf") {
    try { ex = await extractPdf(await lib(), bytes); }
    catch { ex = { status: "error", text: "", pages: null, truncated: false, error: "Não foi possível carregar o leitor de PDF. Tente novamente com internet na primeira vez." }; }
  } else ex = extractPlain(bytes);

  const doc = DocumentSchema.parse({
    id: crypto.randomUUID(), subjectId, name: file.name, kind: v.kind, mime: file.type || (v.kind === "pdf" ? "application/pdf" : "text/plain"),
    size: file.size, createdAt: Date.now(), status: ex.status, error: ex.error, pages: ex.pages, chars: ex.text.length, truncated: ex.truncated, hasOriginal: true,
  });
  try {
    await db.transaction("rw", db.documents, db.docTexts, db.docFiles, async () => {
      await db.documents.add(doc);
      await db.docTexts.add({ id: doc.id, text: ex.text });
      await db.docFiles.add({ id: doc.id, blob: new Blob([bytes.slice()], { type: doc.mime }) });
    });
  } catch (e) {
    const quota = (e as { name?: string })?.name === "QuotaExceededError";
    return { ok: false, error: quota ? `“${file.name}”: o armazenamento do navegador está cheio. Exclua materiais ou exporte um backup e libere espaço.` : `“${file.name}”: não foi possível salvar o arquivo neste dispositivo.` };
  }
  return { ok: true, doc };
}

export async function deleteDocument(id: string) {
  await db.transaction("rw", db.documents, db.docTexts, db.docFiles, async () => {
    await db.documents.delete(id); await db.docTexts.delete(id); await db.docFiles.delete(id);
  });
}

export async function moveDocument(id: string, subjectId: string | null) {
  await db.documents.update(id, { subjectId });
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type SearchHit = { doc: StudyDocument; snippet: string | null };

/** Busca por nome e por texto extraído, ignorando acentos e maiúsculas. Percorre os textos um a um para não carregá-los todos. */
export async function searchDocuments(query: string, docs: StudyDocument[]): Promise<SearchHit[]> {
  const q = fold(query.trim());
  if (q.length < 2) return docs.map((doc) => ({ doc, snippet: null }));
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const t = await db.docTexts.get(doc.id);
    const text = t?.text ?? "";
    const i = fold(text).indexOf(q);
    if (i >= 0) {
      const a = Math.max(0, i - 60), b = Math.min(text.length, i + q.length + 60);
      hits.push({ doc, snippet: (a > 0 ? "…" : "") + text.slice(a, b).replace(/\s+/g, " ") + (b < text.length ? "…" : "") });
    } else if (fold(doc.name).includes(q)) hits.push({ doc, snippet: null });
  }
  return hits;
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
