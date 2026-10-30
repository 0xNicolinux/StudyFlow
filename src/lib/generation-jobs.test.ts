import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { StudyFlowDB, db, __setDb } from "./db";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  enqueueGenerationJob,
  failGenerationJob,
  markGenerationViewed,
  recoverInterruptedGenerationJobs,
  retryGenerationJob,
} from "./generation-jobs";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __setDb(new StudyFlowDB(`generation-jobs-${Math.random()}`));
});

const queued = (title: string, sourceKey?: string) => enqueueGenerationJob({
  kind: "flashcards",
  title,
  subjectId: null,
  source: "category",
  toolName: "create_flashcards",
  requestText: "Crie flashcards sobre POO",
  contextText: "",
  ...(sourceKey ? { sourceKey, payload: { title, cards: [{ front: "O que é classe?", back: "Um molde." }] } } : {}),
});

describe("generation job queue", () => {
  it("stores jobs and claims them in FIFO order, one at a time", async () => {
    const first = await queued("Primeiro");
    const second = await queued("Segundo");
    const claimed = await claimNextGenerationJob();
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.status).toBe("generating");
    expect(await claimNextGenerationJob()).toBeNull();
    expect((await db.generationJobs.get(second.id))?.status).toBe("queued");
  });

  it("deduplicates chat tool calls with the same source key", async () => {
    const a = await queued("Deck", "conversation-1:call-1");
    const b = await queued("Deck duplicado", "conversation-1:call-1");
    expect(b.id).toBe(a.id);
    expect(await db.generationJobs.count()).toBe(1);
  });

  it("completes a claimed job and rejects a duplicate completion", async () => {
    const job = await queued("Deck");
    await claimNextGenerationJob();
    const done = await completeGenerationJob(job.id, { contentId: "card-1", count: 10 });
    expect(done).toMatchObject({ status: "completed", contentId: "card-1", count: 10, viewedAt: null });
    await expect(completeGenerationJob(job.id, { contentId: "card-2", count: 10 })).rejects.toThrow();
  });

  it("stores failures and lets the student retry them", async () => {
    const job = await queued("Quiz");
    await claimNextGenerationJob();
    const failed = await failGenerationJob(job.id, "Modelo sem suporte a ferramentas.");
    expect(failed).toMatchObject({ status: "failed", error: "Modelo sem suporte a ferramentas." });
    const retried = await retryGenerationJob(job.id);
    expect(retried).toMatchObject({ status: "queued", error: null, startedAt: null, completedAt: null });
  });

  it("marks an opened result as viewed, independently from toast dismissal", async () => {
    const job = await queued("Resumo");
    await claimNextGenerationJob();
    await completeGenerationJob(job.id, { contentId: "note-1", count: 1 });
    const viewed = await markGenerationViewed(job.id);
    expect(viewed.viewedAt).toBeTypeOf("number");
  });

  it("recovers queued and generating jobs as interrupted without claiming completion", async () => {
    const queuedJob = await queued("Na fila");
    const activeJob = await queued("Em andamento");
    await claimNextGenerationJob();
    expect(await recoverInterruptedGenerationJobs()).toBe(2);
    expect((await db.generationJobs.get(queuedJob.id))?.status).toBe("interrupted");
    expect((await db.generationJobs.get(activeJob.id))?.status).toBe("interrupted");
    expect((await db.generationJobs.get(activeJob.id))?.completedAt).toBeNull();
  });
});
