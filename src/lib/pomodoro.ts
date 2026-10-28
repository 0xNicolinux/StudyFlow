import { z } from "zod";

export const ConfigSchema = z.object({
  focusMin: z.number().int().min(1).max(180).default(25),
  shortMin: z.number().int().min(1).max(60).default(5),
  longMin: z.number().int().min(1).max(120).default(15),
  longEvery: z.number().int().min(2).max(10).default(4),
});
export type PomodoroConfig = z.infer<typeof ConfigSchema>;
export const DEFAULT_CONFIG: PomodoroConfig = ConfigSchema.parse({});

export type Phase = "focus" | "short" | "long";
export type PomodoroState = {
  phase: Phase;
  status: "idle" | "running" | "paused";
  phaseMs: number; // duração planejada da fase
  endAt: number | null; // quando running
  leftMs: number; // quando paused/idle
  subjectId: string | null;
  startedAt: number | null; // início da fase de foco (para registrar a sessão)
  cycle: number; // focos concluídos desde o último descanso longo
};
export type Recorded = { subjectId: string | null; startedAt: number; seconds: number } | null;

const phaseMs = (p: Phase, c: PomodoroConfig) => (p === "focus" ? c.focusMin : p === "short" ? c.shortMin : c.longMin) * 60_000;

export const initialState = (c: PomodoroConfig, subjectId: string | null = null): PomodoroState => ({
  phase: "focus", status: "idle", phaseMs: phaseMs("focus", c), endAt: null, leftMs: phaseMs("focus", c), subjectId, startedAt: null, cycle: 0,
});

export const remainingMs = (s: PomodoroState, now: number) => (s.status === "running" && s.endAt !== null ? Math.max(0, s.endAt - now) : s.leftMs);

export function start(s: PomodoroState, now: number): PomodoroState {
  if (s.status === "running") return s;
  return { ...s, status: "running", endAt: now + s.leftMs, startedAt: s.phase === "focus" ? (s.startedAt ?? now) : null };
}

export function pause(s: PomodoroState, now: number): PomodoroState {
  if (s.status !== "running") return s;
  return { ...s, status: "paused", leftMs: remainingMs(s, now), endAt: null };
}

function advance(s: PomodoroState, c: PomodoroConfig, completedFocus: boolean): PomodoroState {
  if (s.phase === "focus") {
    const cycle = completedFocus ? s.cycle + 1 : s.cycle;
    const next: Phase = completedFocus && cycle % c.longEvery === 0 ? "long" : "short";
    return { ...s, phase: next, status: "idle", phaseMs: phaseMs(next, c), leftMs: phaseMs(next, c), endAt: null, startedAt: null, cycle };
  }
  return { ...s, phase: "focus", status: "idle", phaseMs: phaseMs("focus", c), leftMs: phaseMs("focus", c), endAt: null, startedAt: null };
}

/** Sessão a registrar quando o foco termina (naturalmente ou ao pular/parar). Menos de 1 min não conta. */
function record(s: PomodoroState, now: number, natural: boolean): Recorded {
  if (s.phase !== "focus" || s.startedAt === null) return null;
  const elapsed = natural ? s.phaseMs : s.phaseMs - remainingMs(s, now);
  const seconds = Math.round(elapsed / 1000);
  return seconds >= 60 ? { subjectId: s.subjectId, startedAt: s.startedAt, seconds } : null;
}

/** Chamado a cada tick e ao reabrir o app: conclui a fase se o tempo acabou. */
export function tick(s: PomodoroState, now: number, c: PomodoroConfig): { state: PomodoroState; recorded: Recorded; completed: Phase | null } {
  if (s.status === "running" && s.endAt !== null && now >= s.endAt) {
    return { state: advance(s, c, true), recorded: record(s, now, true), completed: s.phase };
  }
  return { state: s, recorded: null, completed: null };
}

/** Pular a fase atual (ou encerrar o foco antes da hora). */
export function skip(s: PomodoroState, now: number, c: PomodoroConfig): { state: PomodoroState; recorded: Recorded } {
  const recorded = record(s, now, false);
  return { state: advance(s, c, false), recorded };
}

export function reset(s: PomodoroState, now: number, c: PomodoroConfig): { state: PomodoroState; recorded: Recorded } {
  const recorded = record(s, now, false);
  return { state: initialState(c, s.subjectId), recorded };
}

export function applyConfig(s: PomodoroState, c: PomodoroConfig): PomodoroState {
  if (s.status !== "idle") return s;
  return { ...s, phaseMs: phaseMs(s.phase, c), leftMs: phaseMs(s.phase, c) };
}

export const formatClock = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
