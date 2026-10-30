import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { StudyFlowDB, db, __setDb } from "../db";
import { GenerationToolDefinitions, dispatchGenerationTool, parseCategoryFallbackText, validateGenerationToolCall } from "./generation";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __setDb(new StudyFlowDB(`generation-${Math.random()}`));
});

describe("generation tools", () => {
  it("exposes only the three allowlisted creation tools", () => {
    expect(GenerationToolDefinitions.map((tool) => tool.function.name)).toEqual([
      "create_flashcards", "create_quiz", "create_note",
    ]);
  });

  it("validates and saves a flashcard deck as one local batch", async () => {
    const result = await dispatchGenerationTool("create_flashcards", {
      title: "POO",
      cards: [{ front: "O que é uma classe?", back: "Um molde para criar objetos." }, { front: "O que é herança?", back: "Reutilização por especialização." }],
    }, null);
    expect(result).toMatchObject({ kind: "flashcards", title: "POO", count: 2 });
    const saved = await db.flashcards.toArray();
    expect(saved).toHaveLength(2);
    expect(saved.every((card) => card.id && card.subjectId === null && card.correct === 0 && card.wrong === 0)).toBe(true);
  });

  it("validates quiz alternatives and persists the correct answer index", async () => {
    const result = await dispatchGenerationTool("create_quiz", {
      title: "POO",
      questions: [{ prompt: "O que é uma classe?", options: ["Um molde", "Uma instância"], answer: 0 }],
    }, "subject-1");
    expect(result).toMatchObject({ kind: "quiz", title: "POO", count: 1 });
    const saved = await db.quizzes.get(result.contentId);
    expect(saved).toMatchObject({ subjectId: "subject-1", questions: [{ prompt: "O que é uma classe?", answer: 0 }] });
  });

  it("saves a Markdown note locally", async () => {
    const result = await dispatchGenerationTool("create_note", {
      title: "Resumo de POO",
      body: "# Classes\n\nClasses definem a estrutura dos objetos.",
    }, null);
    expect(result).toMatchObject({ kind: "note", title: "Resumo de POO", count: 1 });
    expect(await db.notes.get(result.contentId)).toMatchObject({ title: "Resumo de POO", body: "# Classes\n\nClasses definem a estrutura dos objetos." });
  });

  it("rejects unknown tools and invalid tool arguments without saving anything", async () => {
    await expect(dispatchGenerationTool("delete_everything", {}, null)).rejects.toThrow(/ferramenta/i);
    await expect(dispatchGenerationTool("create_quiz", {
      title: "Quiz inválido",
      questions: [{ prompt: "1+1?", options: ["2", "3"], answer: 5 }],
    }, null)).rejects.toThrow();
    await expect(dispatchGenerationTool("create_flashcards", { title: "Vazio", cards: [] }, null)).rejects.toThrow();
    expect([await db.flashcards.count(), await db.quizzes.count(), await db.notes.count()]).toEqual([0, 0, 0]);
  });

  it("parses strict JSON or a JSON code fence for guided category fallback", () => {
    const json = JSON.stringify({ title: "POO", cards: [{ front: "Classe?", back: "Um molde." }] });
    expect(parseCategoryFallbackText("create_flashcards", json)).toEqual({
      title: "POO",
      cards: [{ front: "Classe?", back: "Um molde." }],
    });
    expect(parseCategoryFallbackText("create_flashcards", "```json\\n" + json + "\\n```")).toEqual({
      title: "POO",
      cards: [{ front: "Classe?", back: "Um molde." }],
    });
  });

  it("rejects prose and malformed output in guided category fallback", () => {
    expect(() => parseCategoryFallbackText("create_note", "Aqui está seu resumo: {bad}")).toThrow();
    expect(() => parseCategoryFallbackText("create_flashcards", JSON.stringify({ title: "Vazio", cards: [] }))).toThrow();
  });

  it("enforces per-tool output limits before persistence", () => {
    expect(() => validateGenerationToolCall("create_flashcards", {
      title: "Muitos",
      cards: Array.from({ length: 101 }, () => ({ front: "Pergunta", back: "Resposta" })),
    })).toThrow();
    expect(() => validateGenerationToolCall("create_note", {
      title: "Grande demais",
      body: "x".repeat(200_001),
    })).toThrow();
  });
});
