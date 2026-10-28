import { afterEach, describe, expect, it } from "vitest";
import {
  EMPTY_ADAPTIVE, HALF_LIFE_MS, MIN_EVIDENCE, forgetSubject, lastSubjectId, leastUsedColor, rankPanels, readableOn, recordPanel, recordSubject, suggest,
  type AdaptiveState, type PanelId, type SuggestInput,
} from "./adaptive";
import { createLocalStore } from "./local-store";
import { DAY_MS } from "./stats";

const NOW = new Date(2026, 9, 28, 15, 0, 0).getTime(); // 28/10/2026, 15h (horário local)
const ORDER: PanelId[] = ["tasks", "notes", "focus", "flashcards", "quizzes", "library"];
const visits = (panel: PanelId, times: number, at = NOW, subjectId?: string) => (s: AdaptiveState) => {
  for (let i = 0; i < times; i++) s = recordPanel(s, panel, at, subjectId);
  return s;
};

describe("ordem dos painéis", () => {
  it("mantém a ordem padrão sem evidência suficiente", () => {
    const s = visits("quizzes", MIN_EVIDENCE - 1)(EMPTY_ADAPTIVE);
    expect(rankPanels(ORDER, s.panels, NOW)).toEqual(ORDER);
  });

  it("move para cima o que mais se usa; empates seguem a ordem padrão", () => {
    let s = visits("quizzes", 5)(EMPTY_ADAPTIVE);
    s = visits("library", 3)(s);
    expect(rankPanels(ORDER, s.panels, NOW)).toEqual(["quizzes", "library", "tasks", "notes", "focus", "flashcards"]);
  });

  it("o uso antigo perde peso: o recente passa à frente", () => {
    let s = visits("tasks", 8, NOW - 8 * HALF_LIFE_MS)(EMPTY_ADAPTIVE);
    s = visits("notes", 5)(s);
    expect(rankPanels(ORDER, s.panels, NOW)[0]).toBe("notes");
  });

  it("uso dentro de uma disciplina conta para ela e para o total", () => {
    const s = visits("flashcards", 2, NOW, "d1")(EMPTY_ADAPTIVE);
    expect(s.subjects.d1.panels.flashcards?.n).toBe(2);
    expect(s.panels.flashcards?.n).toBe(2);
  });

  it("esquece uma disciplina excluída sem tocar nas outras", () => {
    let s = recordSubject(recordSubject(EMPTY_ADAPTIVE, "a", NOW), "b", NOW + 1);
    s = forgetSubject(s, "a");
    expect(Object.keys(s.subjects)).toEqual(["b"]);
    expect(lastSubjectId(s, ["a", "b"])).toBe("b");
  });
});

describe("cores", () => {
  const palette = ["#111111", "#222222", "#333333"];
  it("escolhe a menos usada, desempatando pela ordem da paleta", () => {
    expect(leastUsedColor(palette, [])).toBe("#111111");
    expect(leastUsedColor(palette, ["#111111", "#222222"])).toBe("#333333");
    expect(leastUsedColor(palette, ["#111111", "#222222", "#333333", "#111111"])).toBe("#222222");
  });
  it("texto legível sobre a cor da disciplina", () => {
    expect(readableOn("#e8b94f")).toBe("#14121f"); // cor clara → texto escuro
    expect(readableOn("#1a237e")).toBe("#ffffff"); // cor escura → texto claro
  });
});

describe("sugestões contextuais", () => {
  const base: SuggestInput = { now: NOW, subjects: [{ id: "d1", name: "Cálculo" }, { id: "d2", name: "Física" }], tasks: [], cards: [], quizzes: [], sessions: [], adaptive: EMPTY_ADAPTIVE };
  const task = (over: object) => ({ subjectId: "d1", title: "Prova 1", kind: "avaliacao" as const, dueAt: null, done: false, ...over });

  it("sem dados, não sugere nada", () => expect(suggest(base)).toEqual([]));

  it("tarefas atrasadas e cartões vencidos, com a ordem de urgência", () => {
    const r = suggest({ ...base, tasks: [task({ kind: "tarefa", dueAt: NOW - 3 * DAY_MS })], cards: [{ subjectId: "d1", dueAt: NOW - 1 }, { subjectId: "d1", dueAt: NOW + DAY_MS }] });
    expect(r.map((x) => x.id)).toEqual(["overdue", "cards"]);
    expect(r[1].text).toBe("1 cartão pronto para revisar.");
  });

  it("avaliação próxima sem quiz sugere criar um; com quiz, praticar", () => {
    const tasks = [task({ dueAt: NOW + 2 * DAY_MS })];
    const sem = suggest({ ...base, tasks }).find((x) => x.id === "exam")!;
    expect(sem.action).toBe("Criar quiz");
    expect(sem.text).toContain("em 2 dias");
    expect(sem.text).toContain("de Cálculo");
    const com = suggest({ ...base, tasks, quizzes: [{ subjectId: "d1" }] }).find((x) => x.id === "exam")!;
    expect(com.action).toBe("Praticar");
  });

  it("ignora avaliações distantes (mais de 7 dias) e tarefas concluídas", () => {
    expect(suggest({ ...base, tasks: [task({ dueAt: NOW + 20 * DAY_MS }), task({ dueAt: NOW + DAY_MS, done: true })] })).toEqual([]);
  });

  it("o escopo de uma disciplina considera só os dados dela", () => {
    const tasks = [task({ kind: "tarefa", dueAt: NOW - DAY_MS }), task({ subjectId: "d2", kind: "tarefa", dueAt: NOW - DAY_MS }), task({ subjectId: "d2", kind: "tarefa", dueAt: NOW - 2 * DAY_MS })];
    expect(suggest({ ...base, tasks, scope: "d2" })[0]).toMatchObject({ text: "Você tem 2 tarefas atrasadas.", subjectId: "d2" });
    expect(suggest({ ...base, tasks, scope: "d1" })[0].text).toBe("Você tem 1 tarefa atrasada.");
  });

  it("revisões pendentes aparecem na Início, mas não repetem a seção da disciplina", () => {
    const cards = [{ subjectId: "d1", dueAt: NOW - 1 }];
    expect(suggest({ ...base, cards }).map((x) => x.id)).toEqual(["cards"]);
    expect(suggest({ ...base, cards, scope: "d1" })).toEqual([]);
  });

  it("retomar a última disciplina aparece só fora do escopo", () => {
    const adaptive = recordSubject(EMPTY_ADAPTIVE, "d2", NOW);
    expect(suggest({ ...base, adaptive })[0]).toMatchObject({ id: "resume", subjectId: "d2", panel: null });
    expect(suggest({ ...base, adaptive, scope: "d2" })).toEqual([]);
  });

  it("sugere foco só a quem já usa e ainda não estudou hoje", () => {
    const withTask = { ...base, tasks: [task({ kind: "tarefa", dueAt: NOW + DAY_MS })] };
    expect(suggest(withTask).some((x) => x.id === "focus")).toBe(false); // nunca usou foco
    const yesterday = [{ subjectId: "d1", startedAt: NOW - DAY_MS }];
    expect(suggest({ ...withTask, sessions: yesterday }).some((x) => x.id === "focus")).toBe(true);
    const today = [{ subjectId: "d1", startedAt: NOW - 60_000 }];
    expect(suggest({ ...withTask, sessions: today }).some((x) => x.id === "focus")).toBe(false);
  });

  it("limita a quantidade de sugestões", () => {
    const tasks = [task({ kind: "tarefa", dueAt: NOW - DAY_MS }), task({ dueAt: NOW + DAY_MS })];
    const cards = [{ subjectId: "d1", dueAt: NOW - 1 }];
    const sessions = [{ subjectId: "d1", startedAt: NOW - 2 * DAY_MS }];
    const all = { ...base, tasks, cards, sessions, adaptive: recordSubject(EMPTY_ADAPTIVE, "d1", NOW) };
    expect(suggest(all)).toHaveLength(3);
    expect(suggest({ ...all, limit: 5 }).map((x) => x.id)).toEqual(["overdue", "exam", "cards", "resume", "focus"]);
  });

  it("o painel que o usuário mais usa sobe na lista", () => {
    const tasks = [task({ dueAt: NOW + DAY_MS })];
    const cards = [{ subjectId: "d1", dueAt: NOW - 1 }];
    const ids = (a: AdaptiveState) => suggest({ ...base, tasks, cards, adaptive: a }).map((x) => x.id);
    expect(ids(EMPTY_ADAPTIVE)).toEqual(["exam", "cards"]); // 90 antes de 80
    expect(ids(visits("flashcards", 30)(EMPTY_ADAPTIVE))).toEqual(["cards", "exam"]); // 80 + 15 passa 90
  });
});

describe("armazenamento local", () => {
  const mem = () => { const m = new Map<string, string>(); return { m, api: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }; };
  const parse = (raw: unknown) => (typeof raw === "object" && raw && "n" in raw && typeof raw.n === "number" ? { n: raw.n } : { n: 0 });
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

  it("persiste, devolve a mesma referência sem mudanças e ignora dados corrompidos", () => {
    const { m, api } = mem();
    (globalThis as { localStorage?: unknown }).localStorage = api;
    const store = createLocalStore("k", parse);
    expect(store.get()).toBe(store.initial);
    store.set({ n: 3 });
    expect(m.get("k")).toBe('{"n":3}');
    expect(store.get()).toBe(store.get());
    m.set("k", "{quebrado");
    expect(store.get()).toEqual({ n: 0 });
  });

  it("com o armazenamento bloqueado, o valor vale na sessão e o app não quebra", () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem: () => { throw new Error("cheio"); }, removeItem: () => undefined };
    const store = createLocalStore("k", parse);
    store.set((p) => ({ n: p.n + 1 }));
    expect(store.get()).toEqual({ n: 1 });
  });
});
