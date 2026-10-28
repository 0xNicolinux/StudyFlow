import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { StudyFlowDB, db, __setDb } from "./db";
import {
  addMessage,
  clearConversations,
  createConversation,
  deleteConversation,
  listConversations,
  createNote,
  createProfilePost,
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
    const s = await createSubject({ name: "Física", icon: "📘" });
    await createTask({ title: "Prova 1", subjectId: s.id, kind: "avaliacao", dueAt: 1_800_000_000_000 });
    await createNote({ title: "Resumo", subjectId: s.id, body: "# Leis de Newton" });
    await saveProfile({ name: "Ana", photo: "data:video/mp4;base64,AAAA", institution: "UFSE", educationLevel: "superior", graduationYear: 2028, role: "estudante", country: "Brasil" });
    const post = await createProfilePost({ text: "Primeira publicação", media: null });
    const backup = JSON.stringify(await exportBackup());

    __setDb(new StudyFlowDB(`test-${Math.random()}`));
    const result = await importBackup(backup);
    expect(result).toMatchObject({ ok: true, counts: { subjects: 1, tasks: 1, notes: 1 } });
    expect((await db.notes.toArray())[0].body).toBe("# Leis de Newton");
    expect((await db.subjects.get(s.id))?.icon).toBe("📘");
    expect((await db.profile.get("me"))?.name).toBe("Ana");
    expect((await db.profile.get("me"))?.institution).toBe("UFSE");
    expect((await db.profile.get("me"))?.photo).toBe("data:video/mp4;base64,AAAA");
    expect((await db.posts.get(post.id))?.text).toBe("Primeira publicação");
  });

  it("aceita backups antigos sem publicações de perfil", async () => {
    const oldBackup = JSON.stringify({ app: "studyflow", version: 1, exportedAt: 1, data: { subjects: [], tasks: [], notes: [], profile: null } });
    const result = await importBackup(oldBackup);
    expect(result.ok).toBe(true);
    expect(await db.posts.count()).toBe(0);
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

describe("conversas por disciplina", () => {
  it("cada disciplina lista só as próprias conversas; as gerais ficam à parte", async () => {
    const a = await createSubject({ name: "A" });
    const b = await createSubject({ name: "B" });
    const ca1 = await createConversation("a1", a.id);
    await createConversation("a2", a.id);
    await createConversation("b1", b.id);
    await createConversation("geral", null);
    expect((await listConversations(a.id)).map((c) => c.title).sort()).toEqual(["a1", "a2"]);
    expect((await listConversations(b.id)).map((c) => c.title)).toEqual(["b1"]);
    expect((await listConversations(null)).map((c) => c.title)).toEqual(["geral"]);
    expect(ca1.subjectId).toBe(a.id);
  });

  it("a mais recente vem primeiro", async () => {
    const s = await createSubject({ name: "A" });
    const old = await createConversation("antiga", s.id);
    const recent = await createConversation("recente", s.id);
    await addMessage(old.id, "user", "oi"); // atualiza a antiga: agora ela é a mais recente
    expect((await listConversations(s.id)).map((c) => c.id)).toEqual([old.id, recent.id]);
  });

  it("excluir uma conversa apaga as mensagens dela e preserva as demais", async () => {
    const s = await createSubject({ name: "A" });
    const c1 = await createConversation("c1", s.id);
    const c2 = await createConversation("c2", s.id);
    await addMessage(c1.id, "user", "x"); await addMessage(c2.id, "user", "y");
    await deleteConversation(c1.id);
    expect((await db.messages.toArray()).map((m) => m.content)).toEqual(["y"]);
    expect((await listConversations(s.id)).map((c) => c.id)).toEqual([c2.id]);
  });

  it("limpar o histórico de uma disciplina não toca nas outras nem nas gerais", async () => {
    const a = await createSubject({ name: "A" });
    const b = await createSubject({ name: "B" });
    const ca = await createConversation("a", a.id);
    const cb = await createConversation("b", b.id);
    const cg = await createConversation("g", null);
    for (const c of [ca, cb, cg]) await addMessage(c.id, "user", c.title);
    await clearConversations(a.id);
    expect((await db.conversations.toArray()).map((c) => c.title).sort()).toEqual(["b", "g"]);
    expect((await db.messages.toArray()).map((m) => m.content).sort()).toEqual(["b", "g"]);
  });
});

describe("identificação da disciplina", () => {
  it("salva e atualiza o ícone opcional sem quebrar disciplinas antigas", async () => {
    const plain = await createSubject({ name: "Física" });
    expect(plain.icon).toBeNull();
    const custom = await updateSubject(plain.id, { icon: "🧪", color: "#06b6d4" });
    expect(custom.icon).toBe("🧪");
    expect(custom.color).toBe("#06b6d4");
  });
});

describe("cor padrão da disciplina", () => {
  it("usa a cor menos repetida, mesmo depois de excluir disciplinas", async () => {
    const [a, b] = [await createSubject({ name: "A" }), await createSubject({ name: "B" })];
    await deleteSubject(a.id);
    const c = await createSubject({ name: "C" });
    expect(new Set([b.color, c.color]).size).toBe(2);
  });
});
