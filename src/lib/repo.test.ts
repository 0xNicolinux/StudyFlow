import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { StudyFlowDB, db, __setDb } from "./db";
import {
  createNote,
  createSubject,
  createTask,
  deleteSubject,
  exportBackup,
  importBackup,
  saveProfile,
  toggleTask,
  updateSubject,
} from "./repo";

beforeEach(() => {
  // Banco novo e isolado a cada teste.
  globalThis.indexedDB = new IDBFactory();
  __setDb(new StudyFlowDB(`test-${Math.random()}`));
});

describe("disciplinas", () => {
  it("cria, edita e persiste", async () => {
    const s = await createSubject({ name: "Cálculo I" });
    await updateSubject(s.id, { name: "Cálculo II", goals: "Passar com 8" });
    const stored = await db.subjects.get(s.id);
    expect(stored?.name).toBe("Cálculo II");
    expect(stored?.goals).toBe("Passar com 8");
  });

  it("rejeita nome vazio", async () => {
    await expect(createSubject({ name: "   " })).rejects.toThrow();
    expect(await db.subjects.count()).toBe(0);
  });

  it("excluir remove tarefas e anotações da disciplina, mas preserva as de outras", async () => {
    const a = await createSubject({ name: "A" });
    const b = await createSubject({ name: "B" });
    await createTask({ title: "t-a", subjectId: a.id });
    await createNote({ title: "n-a", subjectId: a.id });
    await createTask({ title: "t-b", subjectId: b.id });
    await deleteSubject(a.id);
    expect(await db.subjects.count()).toBe(1);
    expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(["t-b"]);
    expect(await db.notes.count()).toBe(0);
  });
});

describe("tarefas", () => {
  it("alterna conclusão", async () => {
    const t = await createTask({ title: "Lista 1", subjectId: null });
    await toggleTask(t.id);
    expect((await db.tasks.get(t.id))?.done).toBe(true);
    await toggleTask(t.id);
    expect((await db.tasks.get(t.id))?.done).toBe(false);
  });
});

describe("backup", () => {
  it("exporta e reimporta os mesmos dados", async () => {
    const s = await createSubject({ name: "Física" });
    await createTask({ title: "Prova 1", subjectId: s.id, kind: "avaliacao", dueAt: 1_800_000_000_000 });
    await createNote({ title: "Resumo", subjectId: s.id, body: "# Leis de Newton" });
    await saveProfile({ name: "Ana", photo: null });
    const backup = JSON.stringify(await exportBackup());

    __setDb(new StudyFlowDB(`test-${Math.random()}`));
    const result = await importBackup(backup);
    expect(result).toMatchObject({ ok: true, counts: { subjects: 1, tasks: 1, notes: 1 } });
    expect((await db.notes.toArray())[0].body).toBe("# Leis de Newton");
    expect((await db.profile.get("me"))?.name).toBe("Ana");
  });

  it("rejeita JSON inválido sem alterar os dados atuais", async () => {
    await createSubject({ name: "Intacta" });
    const r = await importBackup("{não é json");
    expect(r.ok).toBe(false);
    expect(await db.subjects.count()).toBe(1);
  });

  it("rejeita estrutura inválida sem alterar os dados atuais", async () => {
    await createSubject({ name: "Intacta" });
    const bad = JSON.stringify({ app: "studyflow", version: 1, exportedAt: 1, data: { subjects: [{ id: "x" }], tasks: [], notes: [], profile: null } });
    const r = await importBackup(bad);
    expect(r.ok).toBe(false);
    expect((await db.subjects.toArray())[0].name).toBe("Intacta");
  });

  it("rejeita versão desconhecida", async () => {
    const r = await importBackup(JSON.stringify({ app: "studyflow", version: 99, exportedAt: 1, data: {} }));
    expect(r.ok).toBe(false);
  });
});
