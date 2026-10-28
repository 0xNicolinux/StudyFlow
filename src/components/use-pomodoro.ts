"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as pomo from "@/lib/pomodoro";
import { recordSession } from "@/lib/study-repo";

const KEY = "studyflow.pomodoro.v1";
const EVENT = "studyflow:pomodoro";
type Stored = { config: pomo.PomodoroConfig; state: pomo.PomodoroState };

const fresh = (): Stored => ({ config: pomo.DEFAULT_CONFIG, state: pomo.initialState(pomo.DEFAULT_CONFIG) });

function parse(raw: string): Stored {
  if (!raw) return fresh();
  try {
    const j = JSON.parse(raw);
    const config = pomo.ConfigSchema.safeParse(j.config);
    const st = j.state;
    const valid = st && ["focus", "short", "long"].includes(st.phase) && ["idle", "running", "paused"].includes(st.status) && Number.isFinite(st.phaseMs) && Number.isFinite(st.leftMs);
    return config.success && valid ? { config: config.data, state: st } : fresh();
  } catch { return fresh(); }
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};
const read = (): Stored => parse(typeof localStorage === "undefined" ? "" : (safeGet() ?? ""));
const safeGet = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
function write(s: Stored) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: o timer segue só em memória até recarregar */ }
  window.dispatchEvent(new Event(EVENT));
}

export type PomodoroController = ReturnType<typeof usePomodoro>;

/** Estado do cronômetro persistido no navegador; o tempo é calculado por horário (não por contagem), então sobrevive a abas em segundo plano. */
export function usePomodoro() {
  const raw = useSyncExternalStore(subscribe, () => safeGet() ?? "", () => "");
  const { config, state } = useMemo(() => parse(raw), [raw]);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);

  const settle = useCallback((n: number) => {
    const cur = read();
    const r = pomo.tick(cur.state, n, cur.config);
    if (!r.completed) return;
    write({ ...cur, state: r.state });
    if (r.recorded) void recordSession(r.recorded);
    setNotice(r.completed === "focus" ? "Foco concluído! Hora de descansar." : "Descanso encerrado. Pronto para o próximo foco?");
  }, []);

  useEffect(() => {
    if (state.status !== "running") return;
    // Fase que terminou enquanto o app estava fechado: verifica logo após montar (em callback, não no corpo do effect).
    const first = setTimeout(() => { const n = Date.now(); setNow(n); settle(n); }, 0);
    const id = setInterval(() => { const n = Date.now(); setNow(n); settle(n); }, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [state.status, settle]);

  const left = pomo.remainingMs(state, state.status === "running" ? now : 0);
  const clock = pomo.formatClock(left);

  useEffect(() => {
    if (state.status === "running") document.title = `${clock} · StudyFlow`;
    else document.title = "StudyFlow";
  }, [state.status, clock]);

  const act = useCallback((fn: (c: Stored, n: number) => { next: pomo.PomodoroState; recorded?: pomo.Recorded; cfg?: pomo.PomodoroConfig }) => {
    const cur = read(); const n = Date.now();
    const r = fn(cur, n);
    write({ config: r.cfg ?? cur.config, state: r.next });
    setNow(n); setNotice(null);
    if (r.recorded) void recordSession(r.recorded);
  }, []);

  return {
    config, state, clock, left, notice, dismissNotice: () => setNotice(null),
    start: () => act((c, n) => ({ next: pomo.start(c.state, n) })),
    pause: () => act((c, n) => ({ next: pomo.pause(c.state, n) })),
    skip: () => act((c, n) => { const r = pomo.skip(c.state, n, c.config); return { next: r.state, recorded: r.recorded }; }),
    reset: () => act((c, n) => { const r = pomo.reset(c.state, n, c.config); return { next: r.state, recorded: r.recorded }; }),
    setSubject: (subjectId: string | null) => act((c) => ({ next: { ...c.state, subjectId } })),
    setConfig: (cfg: pomo.PomodoroConfig) => act((c) => ({ next: pomo.applyConfig(c.state, cfg), cfg })),
  };
}
