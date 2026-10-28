import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { StudyFlowDB, db, __setDb } from "./db";
import { schedule } from "./srs";
import { dueCount, formatDuration, quizAverage, retention, secondsPerDay, sessionsSince, totalSeconds } from "./stats";
import * as pomo from "./pomodoro";
import { createFlashcard, recordAttempt, recordSession, reviewFlashcard, saveQuiz, deleteQuiz } from "./study-repo";
import { createSubject, deleteSubject, exportBackup, importBackup } from "./repo";
import { MAX_FILE_BYTES, MAX_TEXT_CHARS, decodeText, deleteDocument, extractPdf, extractPlain, importFile, searchDocuments, validateFile } from "./docs";

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url)));
const mkFile = (bytes: Uint8Array | string, name: string, type = "") => new File([bytes as BlobPart], name, { type });
async function legacyLib() {
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return lib as never;
}
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); __setDb(new StudyFlowDB(`s-${Math.random()}`)); });

describe("revisão espaçada", () => {
  const base = { intervalDays: 0, ease: 2.5, correct: 0, wrong: 0 };
  const T = 1_000_000;
  it("errar reagenda em 10 min, reduz facilidade e conta o erro", () => {
    const r = schedule({ ...base, intervalDays: 6 }, 0, T);
    expect(r).toMatchObject({ intervalDays: 0, wrong: 1, dueAt: T + 600_000 });
    expect(r.ease).toBeCloseTo(2.3);
  });
  it("cartão novo: bom = 1 dia, fácil = 4 dias", () => {
    expect(schedule(base, 2, T).intervalDays).toBe(1);
    expect(schedule(base, 3, T).intervalDays).toBe(4);
  });
  it("intervalos crescem com acertos e nunca regridem em acerto", () => {
    let c = { ...base }; let last = 0;
    for (let i = 0; i < 6; i++) { const r = schedule(c, 2, T); expect(r.intervalDays).toBeGreaterThan(last); last = r.intervalDays; c = { ...c, ...r }; }
    expect(c.correct).toBe(6);
  });
  it("facilidade fica entre 1,3 e 3", () => {
    let c = { ...base, ease: 1.35, intervalDays: 3 };
    for (let i = 0; i < 5; i++) c = { ...c, ...schedule(c, 0, T) };
    expect(c.ease).toBeGreaterThanOrEqual(1.3);
    let d = { ...base, ease: 2.95, intervalDays: 3 };
    for (let i = 0; i < 5; i++) d = { ...d, ...schedule(d, 3, T) };
    expect(d.ease).toBeLessThanOrEqual(3);
  });
  it("persiste a revisão no banco", async () => {
    const c = await createFlashcard({ subjectId: null, front: "P", back: "R" });
    await reviewFlashcard(c.id, 2, 5_000);
    const s = await db.flashcards.get(c.id);
    expect(s).toMatchObject({ intervalDays: 1, correct: 1 });
    expect(s!.dueAt).toBe(5_000 + 86_400_000);
  });
  it("cartão novo já nasce para revisar", async () => {
    const c = await createFlashcard({ subjectId: null, front: "P", back: "R" });
    expect(dueCount([c], Date.now())).toBe(1);
    expect(dueCount([c], 1)).toBe(1);
  });
  it("rejeita cartão vazio", async () => { await expect(createFlashcard({ subjectId: null, front: " ", back: "x" })).rejects.toThrow(); });
});

describe("estatísticas", () => {
  it("médias e retenção são nulas sem dados", () => { expect(quizAverage([])).toBeNull(); expect(retention([{ correct: 0, wrong: 0 }])).toBeNull(); });
  it("calcula média ponderada e retenção", () => {
    expect(quizAverage([{ score: 3, total: 4 }, { score: 1, total: 4 }])).toBe(50);
    expect(retention([{ correct: 3, wrong: 1 }, { correct: 1, wrong: 1 }])).toBe(67);
  });
  it("conta vencidos", () => { expect(dueCount([{ dueAt: 1 }, { dueAt: 5 }, { dueAt: 10 }], 5)).toBe(2); });
  it("agrega tempo por janela de dias", () => {
    const now = new Date(2026, 9, 27, 15).getTime();
    const day = (d: number, h = 10) => new Date(2026, 9, 27 - d, h).getTime();
    const ss = [{ id: "a", subjectId: null, startedAt: day(0), seconds: 1500 }, { id: "b", subjectId: null, startedAt: day(3), seconds: 600 }, { id: "c", subjectId: null, startedAt: day(10), seconds: 999 }];
    expect(totalSeconds(sessionsSince(ss, 7, now))).toBe(2100);
    const per = secondsPerDay(ss, 7, now);
    expect(per).toHaveLength(7); expect(per[6].seconds).toBe(1500); expect(per[3].seconds).toBe(600);
  });
  it("formata duração", () => { expect(formatDuration(25 * 60)).toBe("25 min"); expect(formatDuration(95 * 60)).toBe("1 h 35 min"); expect(formatDuration(120 * 60)).toBe("2 h"); });
});

describe("pomodoro", () => {
  const C = pomo.DEFAULT_CONFIG; const T0 = 1_000_000;
  it("conclui o foco, registra a sessão e passa para o descanso curto (parado)", () => {
    const s = pomo.start(pomo.initialState(C, "sub"), T0);
    expect(pomo.tick(s, T0 + 1000, C).completed).toBeNull();
    const r = pomo.tick(s, T0 + 25 * 60_000, C);
    expect(r.completed).toBe("focus");
    expect(r.recorded).toEqual({ subjectId: "sub", startedAt: T0, seconds: 1500 });
    expect(r.state).toMatchObject({ phase: "short", status: "idle", cycle: 1 });
  });
  it("a cada 4 focos vem o descanso longo", () => {
    let s = pomo.initialState(C); let now = T0;
    for (let i = 1; i <= 4; i++) {
      s = pomo.start(s, now); now += 25 * 60_000; s = pomo.tick(s, now, C).state;
      if (i < 4) { expect(s.phase).toBe("short"); s = pomo.start(s, now); now += 5 * 60_000; s = pomo.tick(s, now, C).state; expect(s.phase).toBe("focus"); }
    }
    expect(s.phase).toBe("long");
  });
  it("pausar preserva o tempo restante e retomar continua dele", () => {
    let s = pomo.start(pomo.initialState(C), T0);
    s = pomo.pause(s, T0 + 10 * 60_000);
    expect(pomo.remainingMs(s, T0 + 999_999_999)).toBe(15 * 60_000);
    s = pomo.start(s, T0 + 60 * 60_000);
    expect(s.endAt).toBe(T0 + 60 * 60_000 + 15 * 60_000);
  });
  it("encerrar o foco antes da hora registra só o tempo decorrido; menos de 1 min não conta", () => {
    let s = pomo.start(pomo.initialState(C, null), T0);
    expect(pomo.skip(s, T0 + 30_000, C).recorded).toBeNull();
    expect(pomo.skip(s, T0 + 10 * 60_000, C).recorded?.seconds).toBe(600);
    s = pomo.pause(pomo.start(pomo.initialState(C), T0), T0 + 5 * 60_000);
    expect(pomo.skip(s, T0 + 99 * 60_000, C).recorded?.seconds).toBe(300); // pausa não conta como estudo
  });
  it("pular descanso não registra sessão nem conta foco", () => {
    const s = { ...pomo.initialState(C), phase: "short" as const, cycle: 2 };
    const r = pomo.skip(pomo.start(s, T0), T0 + 1000, C);
    expect(r.recorded).toBeNull(); expect(r.state).toMatchObject({ phase: "focus", cycle: 2 });
  });
  it("reabrir o app depois do fim conclui a fase", () => {
    const s = pomo.start(pomo.initialState(C), T0);
    expect(pomo.tick(s, T0 + 10 * 3600_000, C).completed).toBe("focus");
  });
  it("formata relógio", () => { expect(pomo.formatClock(25 * 60_000)).toBe("25:00"); expect(pomo.formatClock(61_000)).toBe("01:01"); expect(pomo.formatClock(0)).toBe("00:00"); });
});

describe("quizzes", () => {
  const q = (answer = 0) => ({ prompt: "2+2?", options: ["4", "5"], answer });
  it("valida e persiste; recusa resposta fora das alternativas", async () => {
    const quiz = await saveQuiz({ title: "Soma", subjectId: null, questions: [q()] });
    expect((await db.quizzes.get(quiz.id))?.questions).toHaveLength(1);
    await expect(saveQuiz({ title: "Ruim", subjectId: null, questions: [q(5)] })).rejects.toThrow();
    await expect(saveQuiz({ title: "Vazio", subjectId: null, questions: [] })).rejects.toThrow();
    await expect(saveQuiz({ title: "Opção vazia", subjectId: null, questions: [{ prompt: "x", options: ["a", " "], answer: 0 }] })).rejects.toThrow();
  });
  it("registra tentativas e apaga junto com o quiz", async () => {
    const quiz = await saveQuiz({ title: "Soma", subjectId: null, questions: [q(), q()] });
    await recordAttempt(quiz, 1);
    expect(await db.quizAttempts.count()).toBe(1);
    await deleteQuiz(quiz.id);
    expect(await db.quizAttempts.count()).toBe(0);
  });
});

describe("biblioteca: validação e extração", () => {
  it("valida formato, tamanho, vazio e conteúdo", () => {
    expect(validateFile("a.docx", 10, new Uint8Array([1])).ok).toBe(false);
    expect(validateFile("a.txt", 0, new Uint8Array()).ok).toBe(false);
    expect(validateFile("a.txt", MAX_FILE_BYTES + 1, new Uint8Array([65])).ok).toBe(false);
    expect(validateFile("a.pdf", 10, new TextEncoder().encode("não é pdf")).ok).toBe(false);
    expect(validateFile("a.txt", 3, new Uint8Array([65, 0, 66])).ok).toBe(false);
    expect(validateFile("A.PDF", 10, new TextEncoder().encode("%PDF-1.7")).ok).toBe(true);
    expect(validateFile("n.markdown", 3, new Uint8Array([65, 66, 67]))).toEqual({ ok: true, kind: "md" });
  });
  it("decodifica UTF-8, BOM, CRLF e cai para windows-1252", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("olá\r\nmundo")]))).toBe("olá\nmundo");
    expect(decodeText(new Uint8Array([0x6f, 0x6c, 0xe1]))).toBe("olá"); // "olá" em latin1
  });
  it("texto só com espaços é 'empty'; texto enorme é truncado e sinalizado", () => {
    expect(extractPlain(new TextEncoder().encode("  \n ")).status).toBe("empty");
    const r = extractPlain(new TextEncoder().encode("a".repeat(MAX_TEXT_CHARS + 10)));
    expect(r.truncated).toBe(true); expect(r.text.length).toBe(MAX_TEXT_CHARS);
  });
  it("extrai texto de PDF real, página a página", async () => {
    const r = await extractPdf(await legacyLib(), fx("texto.pdf"));
    expect(r.status).toBe("ok"); expect(r.pages).toBe(2);
    expect(r.text).toContain("limites e continuidade"); expect(r.text).toContain("regra da cadeia");
  });
  it("PDF sem texto vira 'empty' com explicação sobre OCR", async () => {
    const r = await extractPdf(await legacyLib(), fx("vazio.pdf"));
    expect(r.status).toBe("empty"); expect(r.error).toMatch(/OCR/);
  });
  it("PDF com senha e PDF corrompido viram erro com mensagem específica", async () => {
    expect((await extractPdf(await legacyLib(), fx("senha.pdf"))).error).toMatch(/senha/);
    const bad = await extractPdf(await legacyLib(), fx("corrompido.pdf"));
    expect(bad.status).toBe("error"); expect(bad.error).toMatch(/corrompido|inválido|Falha/);
  });
});

describe("biblioteca: importação, busca e exclusão", () => {
  const lib = () => legacyLib() as never;
  it("importa PDF e mantém original e texto extraído separados", async () => {
    const r = await importFile(mkFile(fx("texto.pdf"), "apostila.pdf", "application/pdf"), null, lib);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.doc).toMatchObject({ kind: "pdf", status: "ok", pages: 2, hasOriginal: true });
    const blob = (await db.docFiles.get(r.doc.id))!.blob;
    expect(blob.size).toBe(r.doc.size); // original intacto
    expect((await db.docTexts.get(r.doc.id))!.text).toContain("derivadas");
  });
  it("recusa arquivo inválido sem gravar nada", async () => {
    const r = await importFile(mkFile("texto", "foto.png"), null, lib);
    expect(r.ok).toBe(false);
    expect(await db.documents.count()).toBe(0);
  });
  it("PDF corrompido é guardado com status de erro (original preservado, sem texto)", async () => {
    const r = await importFile(mkFile(fx("corrompido.pdf"), "quebrado.pdf"), null, lib);
    expect(r.ok && r.doc.status).toBe("error");
    expect((await db.docTexts.get((r as { doc: { id: string } }).doc.id))!.text).toBe("");
  });
  it("busca por texto e por nome, sem acento e sem diferenciar maiúsculas", async () => {
    await importFile(mkFile("As derivadas medem a variação instantânea.", "resumo.md"), null, lib);
    await importFile(mkFile("Integrais e áreas.", "anotacoes-geometria.txt"), null, lib);
    const docs = await db.documents.toArray();
    const a = await searchDocuments("VARIACAO", docs);
    expect(a).toHaveLength(1); expect(a[0].snippet).toMatch(/variação/);
    expect((await searchDocuments("geometria", docs))[0].doc.name).toBe("anotacoes-geometria.txt");
    expect(await searchDocuments("inexistente", docs)).toHaveLength(0);
    expect(await searchDocuments("x", docs)).toHaveLength(2); // consulta curta demais: lista tudo
  });
  it("excluir remove documento, texto e arquivo", async () => {
    const r = await importFile(mkFile("abc", "a.txt"), null, lib); if (!r.ok) throw new Error();
    await deleteDocument(r.doc.id);
    expect([await db.documents.count(), await db.docTexts.count(), await db.docFiles.count()]).toEqual([0, 0, 0]);
  });
  it("excluir disciplina apaga flashcards, quizzes, materiais; mantém o tempo de estudo desvinculado", async () => {
    const s = await createSubject({ name: "X" });
    await createFlashcard({ subjectId: s.id, front: "a", back: "b" });
    const quiz = await saveQuiz({ title: "q", subjectId: s.id, questions: [{ prompt: "p", options: ["a", "b"], answer: 0 }] });
    await recordAttempt(quiz, 1);
    await recordSession({ subjectId: s.id, startedAt: 1, seconds: 600 });
    await importFile(mkFile("texto", "a.txt"), s.id, lib);
    await deleteSubject(s.id);
    expect(await db.flashcards.count() + await db.quizzes.count() + await db.quizAttempts.count() + await db.documents.count() + await db.docTexts.count() + await db.docFiles.count()).toBe(0);
    expect((await db.studySessions.toArray())[0]).toMatchObject({ seconds: 600, subjectId: null });
  });
});

describe("backup das novas tabelas", () => {
  const lib = () => legacyLib() as never;
  async function seed() {
    const s = await createSubject({ name: "S" });
    await createFlashcard({ subjectId: s.id, front: "f", back: "b" });
    await saveQuiz({ title: "q", subjectId: s.id, questions: [{ prompt: "p", options: ["a", "b"], answer: 1 }] });
    await recordSession({ subjectId: s.id, startedAt: 5, seconds: 900 });
    const r = await importFile(mkFile(fx("texto.pdf"), "apostila.pdf", "application/pdf"), s.id, lib); if (!r.ok) throw new Error();
    return r.doc;
  }
  it("sem arquivos: leva texto extraído e marca os documentos como sem original", async () => {
    await seed();
    const json = JSON.stringify(await exportBackup());
    __setDb(new StudyFlowDB(`s-${Math.random()}`));
    const r = await importBackup(json);
    expect(r).toMatchObject({ ok: true, counts: { flashcards: 1, quizzes: 1, documents: 1 }, documentsWithoutOriginal: 1 });
    const [doc] = await db.documents.toArray();
    expect(doc.hasOriginal).toBe(false);
    expect((await db.docTexts.get(doc.id))!.text).toContain("limites");
    expect(await db.docFiles.count()).toBe(0);
    expect(await db.studySessions.count()).toBe(1);
  });
  it("com arquivos: o PDF original volta byte a byte", async () => {
    const doc = await seed();
    const json = JSON.stringify(await exportBackup({ includeFiles: true }));
    __setDb(new StudyFlowDB(`s-${Math.random()}`));
    const r = await importBackup(json);
    expect(r).toMatchObject({ ok: true, documentsWithoutOriginal: 0 });
    const back = new Uint8Array(await (await db.docFiles.get(doc.id))!.blob.arrayBuffer());
    expect(Buffer.from(back).equals(Buffer.from(fx("texto.pdf")))).toBe(true);
  });
  it("recusa backup com documento sem texto associado, sem alterar os dados atuais", async () => {
    await createSubject({ name: "Intacta" });
    const bad = { app: "studyflow", version: 1, exportedAt: 1, data: { subjects: [], tasks: [], notes: [], profile: null, documents: [{ id: "d", subjectId: null, name: "x.txt", kind: "txt", mime: "text/plain", size: 1, createdAt: 1, status: "ok", error: null, pages: null, chars: 1, truncated: false, hasOriginal: true }] } };
    expect((await importBackup(JSON.stringify(bad))).ok).toBe(false);
    expect(await db.subjects.count()).toBe(1);
  });
});
