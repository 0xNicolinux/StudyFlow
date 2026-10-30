"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, CircleAlert, ExternalLink, LoaderCircle, X } from "lucide-react";
import { db } from "@/lib/db";
import type { GenerationJob } from "@/lib/schemas";
import { dispatchGenerationTool, generateCategoryToolPayload, validateGenerationToolCall, type GenerationKind, type GenerationToolName } from "@/lib/ai/generation";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  enqueueGenerationJob,
  failGenerationJob,
  markGenerationViewed,
  recoverInterruptedGenerationJobs,
  retryGenerationJob,
} from "@/lib/generation-jobs";
import { Button, IconButton } from "./ui";
import { GenerationDialog, type GenerationDialogSubmit } from "./generation-dialog";

type DialogRequest = { kind: GenerationKind; subjectId?: string } | null;

let recoveryPromise: Promise<number> | null = null;
function ensureGenerationRecovery() {
  if (!recoveryPromise) recoveryPromise = recoverInterruptedGenerationJobs().catch(() => 0);
  return recoveryPromise;
}
export type GenerationOpenTarget = { kind: GenerationKind; contentId: string; jobId: string } | null;

type GenerationContextValue = {
  jobs: GenerationJob[];
  openDialog: (kind: GenerationKind, subjectId?: string) => void;
  openTarget: GenerationOpenTarget;
  clearOpenTarget: () => void;
  markKindViewed: (kind: GenerationKind, subjectId?: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  enqueueChatToolCall: (input: {
    toolName: string;
    args: unknown;
    subjectId: string | null;
    sourceKey: string;
    requestText: string;
    contextText: string;
  }) => Promise<GenerationJob>;
};

const GenerationContext = createContext<GenerationContextValue | null>(null);

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (!context) throw new Error("useGeneration precisa estar dentro de GenerationProvider.");
  return context;
}

const TOOL_BY_KIND: Record<GenerationKind, GenerationToolName> = {
  flashcards: "create_flashcards",
  quiz: "create_quiz",
  note: "create_note",
};

const LABEL: Record<GenerationKind, string> = {
  flashcards: "flashcards",
  quiz: "quiz",
  note: "anotação",
};

export function GenerationProvider({
  children,
  onOpenJob,
  onOpenLibrary,
}: {
  children: ReactNode;
  onOpenJob: (job: GenerationJob) => void;
  onOpenLibrary: () => void;
}) {
  const jobs = useLiveQuery(() => db.generationJobs.toArray().then((all) => all.sort((a, b) => a.createdAt - b.createdAt)), []);
  const profile = useLiveQuery(() => db.profile.get("me").then((p) => p ?? null), []);
  const [ready, setReady] = useState(false);
  const [runnerCycle, setRunnerCycle] = useState(0);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogRequest>(null);
  const [openTarget, setOpenTarget] = useState<GenerationOpenTarget>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const running = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    void ensureGenerationRecovery()
      .finally(() => { if (mounted.current) setReady(true); });
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!ready || !jobs || running.current || !jobs.some((job) => job.status === "queued")) return;
    const runNext = async () => {
      running.current = true;
      try {
        const job = await claimNextGenerationJob();
        if (!job) return;
        setRunningId(job.id);
        const controller = new AbortController();
        abort.current = controller;
        try {
          const payload = job.payload === undefined
            ? await generateCategoryToolPayload(job, controller.signal)
            : job.payload;
          const result = await dispatchGenerationTool(job.toolName, payload, job.subjectId);
          await completeGenerationJob(job.id, {
            contentId: result.contentId,
            count: result.count,
            title: result.title,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível concluir a geração.";
          await failGenerationJob(job.id, message).catch(() => undefined);
        } finally {
          abort.current = null;
          setRunningId(null);
        }
      } finally {
        running.current = false;
        if (mounted.current) setRunnerCycle((cycle) => cycle + 1);
      }
    };
    void runNext();
  }, [jobs, ready, runnerCycle]);

  const openDialog = useCallback((kind: GenerationKind, subjectId?: string) => {
    setDialog({ kind, subjectId });
  }, []);

  const markKindViewed = useCallback(async (kind: GenerationKind, subjectId?: string) => {
    const unseen = await db.generationJobs.filter((job) =>
      job.kind === kind && job.status === "completed" && job.viewedAt === null &&
      (subjectId === undefined || job.subjectId === subjectId),
    ).toArray();
    if (!unseen.length) return;
    const now = Date.now();
    await db.generationJobs.bulkPut(unseen.map((job) => ({ ...job, viewedAt: now })));
  }, []);

  const retry = useCallback(async (id: string) => {
    await retryGenerationJob(id);
    setDismissed((current) => { const next = new Set(current); next.delete(id); return next; });
  }, []);

  const enqueueChatToolCall = useCallback(async (input: {
    toolName: string;
    args: unknown;
    subjectId: string | null;
    sourceKey: string;
    requestText: string;
    contextText: string;
  }) => {
    const validated = validateGenerationToolCall(input.toolName, input.args);
    const toolName = input.toolName as GenerationToolName;
    return enqueueGenerationJob({
      kind: validated.kind,
      title: validated.title,
      subjectId: input.subjectId,
      source: "chat",
      sourceKey: input.sourceKey,
      toolName,
      payload: validated.data,
      requestText: input.requestText,
      contextText: input.contextText,
    });
  }, []);

  const submitDialog = useCallback(async (input: GenerationDialogSubmit) => {
    const request = dialog;
    if (!request) return;
    const toolName = TOOL_BY_KIND[request.kind];
    await enqueueGenerationJob({
      kind: request.kind,
      title: request.kind === "flashcards" ? "Novo conjunto de flashcards" : request.kind === "quiz" ? "Novo quiz" : "Nova anotação",
      subjectId: input.subjectId,
      source: "category",
      toolName,
      requestText: input.requestText,
      contextText: input.contextText,
    });
    setDialog(null);
  }, [dialog]);

  const openJob = useCallback((job: GenerationJob) => {
    setDismissed((current) => new Set(current).add(job.id));
    if (job.status === "completed" && job.contentId) {
      setOpenTarget({ kind: job.kind, contentId: job.contentId, jobId: job.id });
      void markGenerationViewed(job.id).catch(() => undefined);
    } else if (job.status === "failed") {
      setDialog({ kind: job.kind, subjectId: job.subjectId ?? undefined });
    }
    onOpenJob(job);
  }, [onOpenJob]);

  const clearOpenTarget = useCallback(() => setOpenTarget(null), []);

  const value = useMemo<GenerationContextValue>(() => ({
    jobs: jobs ?? [],
    openDialog, openTarget, clearOpenTarget, markKindViewed, retry, enqueueChatToolCall,
  }), [jobs, openDialog, openTarget, clearOpenTarget, markKindViewed, retry, enqueueChatToolCall]);

  const notifications = (jobs ?? []).filter((job) =>
    (job.status === "completed" && job.viewedAt === null || job.status === "failed") && !dismissed.has(job.id),
  ).slice(-3).reverse();

  return (
    <GenerationContext.Provider value={value}>
      {children}
      {dialog && (
        <GenerationDialog
          key={`${dialog.kind}:${dialog.subjectId ?? "all"}`}
          request={dialog}
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
          onOpenLibrary={() => { setDialog(null); onOpenLibrary(); }}
        />
      )}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(92vw,24rem)] flex-col gap-2" aria-live="polite">
        {runningId && (
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-xl">
            <LoaderCircle className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
            <span className="min-w-0 flex-1">Gerando conteúdo de estudo…</span>
          </div>
        )}
        {notifications.map((job) => (
          <div key={job.id} className="pointer-events-auto rounded-xl border border-line bg-surface p-3 shadow-xl">
            <div className="flex items-start gap-3">
              {job.status === "completed"
                ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
              <div className="min-w-0 flex-1">
                {job.status === "completed" ? (
                  <>
                    <p className="text-sm font-semibold">Olá, {profile?.name ?? "estudante"}.</p>
                    <p className="mt-0.5 text-sm text-muted">Seu {LABEL[job.kind]} foi gerado. Venha conferir!</p>
                    <p className="mt-1 text-xs text-muted">{job.count} {job.kind === "flashcards" ? "cartões" : job.kind === "quiz" ? "perguntas" : "anotação salva"}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold">Não foi possível gerar o conteúdo.</p>
                    <p className="mt-0.5 text-xs text-muted">{job.error}</p>
                  </>
                )}
              </div>
              <IconButton label="Dispensar notificação" onClick={() => setDismissed((current) => new Set(current).add(job.id))} className="-mr-1 -mt-1 size-7 shrink-0">
                <X className="size-3.5" />
              </IconButton>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {job.status === "failed" && <Button variant="ghost" className="min-h-8 px-2.5 text-xs" onClick={() => void retry(job.id)}>Tentar novamente</Button>}
              <Button variant="primary" className="min-h-8 px-2.5 text-xs" onClick={() => openJob(job)}>
                {job.status === "completed" ? "Abrir conteúdo" : "Abrir categoria"} <ExternalLink className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </GenerationContext.Provider>
  );
}
