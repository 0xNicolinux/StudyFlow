import { db } from "./db";
import { GenerationJobSchema, type GenerationJob } from "./schemas";

const uid = () => crypto.randomUUID();

export type EnqueueGenerationJobInput = {
  kind: GenerationJob["kind"];
  title: string;
  subjectId: string | null;
  source: GenerationJob["source"];
  sourceKey?: string;
  toolName: GenerationJob["toolName"];
  payload?: unknown;
  requestText?: string;
  contextText?: string;
};

export async function enqueueGenerationJob(input: EnqueueGenerationJobInput): Promise<GenerationJob> {
  if (input.sourceKey) {
    const existing = await db.generationJobs.where("sourceKey").equals(input.sourceKey).first();
    if (existing) return existing;
  }
  const job = GenerationJobSchema.parse({
    id: uid(),
    ...input,
    requestText: input.requestText ?? "",
    contextText: input.contextText ?? "",
    status: "queued",
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    contentId: null,
    count: 0,
    error: null,
    viewedAt: null,
  });
  try {
    await db.generationJobs.add(job);
    return job;
  } catch (error) {
    // O índice único impede duas abas de enfileirar a mesma chamada da conversa.
    if (input.sourceKey) {
      const existing = await db.generationJobs.where("sourceKey").equals(input.sourceKey).first();
      if (existing) return existing;
    }
    throw error;
  }
}

/** Claim transacional: mesmo com mais de um efeito/aba, só existe um trabalho em geração por vez. */
export async function claimNextGenerationJob(now = Date.now()): Promise<GenerationJob | null> {
  let claimed: GenerationJob | null = null;
  await db.transaction("rw", db.generationJobs, async () => {
    const active = await db.generationJobs.where("status").equals("generating").count();
    if (active > 0) return;
    const [next] = await db.generationJobs.where("status").equals("queued").sortBy("createdAt");
    if (!next) return;
    claimed = GenerationJobSchema.parse({ ...next, status: "generating", startedAt: now, error: null });
    await db.generationJobs.put(claimed);
  });
  return claimed;
}

export async function completeGenerationJob(
  id: string,
  result: { contentId: string; count: number; title?: string },
  now = Date.now(),
): Promise<GenerationJob> {
  let completed: GenerationJob | undefined;
  await db.transaction("rw", db.generationJobs, async () => {
    const current = await db.generationJobs.get(id);
    if (!current || current.status !== "generating") throw new Error("Este trabalho não está em geração.");
    completed = GenerationJobSchema.parse({
      ...current,
      status: "completed",
      completedAt: now,
      contentId: result.contentId,
      count: result.count,
      title: result.title ?? current.title,
      error: null,
    });
    await db.generationJobs.put(completed);
  });
  return completed!;
}

export async function failGenerationJob(id: string, message: string): Promise<GenerationJob> {
  let failed: GenerationJob | undefined;
  await db.transaction("rw", db.generationJobs, async () => {
    const current = await db.generationJobs.get(id);
    if (!current || current.status !== "generating") throw new Error("Este trabalho não está em geração.");
    failed = GenerationJobSchema.parse({
      ...current,
      status: "failed",
      completedAt: null,
      contentId: null,
      count: 0,
      error: message.trim().slice(0, 500) || "Não foi possível concluir a geração.",
    });
    await db.generationJobs.put(failed);
  });
  return failed!;
}

export async function retryGenerationJob(id: string): Promise<GenerationJob> {
  let retried: GenerationJob | undefined;
  await db.transaction("rw", db.generationJobs, async () => {
    const current = await db.generationJobs.get(id);
    if (!current || (current.status !== "failed" && current.status !== "interrupted")) {
      throw new Error("Somente trabalhos com falha ou interrompidos podem ser repetidos.");
    }
    retried = GenerationJobSchema.parse({
      ...current,
      status: "queued",
      startedAt: null,
      completedAt: null,
      contentId: null,
      count: 0,
      error: null,
    });
    await db.generationJobs.put(retried);
  });
  return retried!;
}

export async function markGenerationViewed(id: string, now = Date.now()): Promise<GenerationJob> {
  let viewed: GenerationJob | undefined;
  await db.transaction("rw", db.generationJobs, async () => {
    const current = await db.generationJobs.get(id);
    if (!current || current.status !== "completed") throw new Error("O conteúdo ainda não foi concluído.");
    viewed = GenerationJobSchema.parse({ ...current, viewedAt: current.viewedAt ?? now });
    await db.generationJobs.put(viewed);
  });
  return viewed!;
}

/** Ao reabrir o app, nenhuma chamada antiga é simulada como concluída ou retomada silenciosamente. */
export async function recoverInterruptedGenerationJobs(): Promise<number> {
  let recovered = 0;
  await db.transaction("rw", db.generationJobs, async () => {
    const active = await db.generationJobs.where("status").anyOf(["queued", "generating"]).toArray();
    if (!active.length) return;
    const next = active.map((job) => GenerationJobSchema.parse({
      ...job,
      status: "interrupted",
      completedAt: null,
      error: "A geração foi interrompida porque o aplicativo foi fechado ou recarregado.",
    }));
    await db.generationJobs.bulkPut(next);
    recovered = next.length;
  });
  return recovered;
}
