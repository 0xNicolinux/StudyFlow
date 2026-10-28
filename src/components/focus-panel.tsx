"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pause, Play, RotateCcw, SkipForward, X } from "lucide-react";
import { db } from "@/lib/db";
import { DEFAULT_CONFIG, ConfigSchema, type Phase } from "@/lib/pomodoro";
import { formatDuration, secondsPerDay, sessionsSince, totalSeconds } from "@/lib/stats";
import { cn } from "@/lib/cn";
import { useNow } from "./use-now";
import { Button, EmptyState, Field, Input, Loading } from "./ui";
import type { PomodoroController } from "./use-pomodoro";

const PHASE_LABEL: Record<Phase, string> = { focus: "Foco", short: "Descanso curto", long: "Descanso longo" };
const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

export function FocusPanel({ timer }: { timer: PomodoroController }) {
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const sessions = useLiveQuery(() => db.studySessions.toArray(), []);
  const { state, config } = timer;
  const running = state.status === "running";
  const pct = Math.round((1 - timer.left / state.phaseMs) * 100);

  return (
    <div className="fade-in grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <section aria-label="Cronômetro" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        {timer.notice && (
          <div role="status" className="flex items-start justify-between gap-2 rounded-lg bg-accent/15 px-3 py-2 text-sm">
            <span>{timer.notice}</span>
            <button onClick={timer.dismissNotice} aria-label="Dispensar aviso" className="text-muted hover:text-fg"><X className="size-4" /></button>
          </div>
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-muted">{PHASE_LABEL[state.phase]}</p>
          <p role="timer" aria-live="off" className="my-2 text-6xl font-semibold tabular-nums tracking-tight" data-testid="clock">{timer.clock}</p>
          <div className="mx-auto h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden><div className={cn("h-full rounded-full", state.phase === "focus" ? "bg-accent" : "bg-success")} style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-xs text-muted">Foco {(state.cycle % config.longEvery) + (state.phase === "focus" ? 1 : 0)} de {config.longEvery} até o descanso longo</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {running ? <Button onClick={timer.pause}><Pause className="size-4" aria-hidden /> Pausar</Button>
            : <Button variant="primary" onClick={timer.start}><Play className="size-4" aria-hidden /> {state.status === "paused" ? "Retomar" : "Iniciar"}</Button>}
          <Button onClick={timer.skip} disabled={state.status === "idle"}><SkipForward className="size-4" aria-hidden /> {state.phase === "focus" ? "Encerrar foco" : "Pular descanso"}</Button>
          <Button variant="ghost" onClick={timer.reset} disabled={state.status === "idle" && state.phase === "focus" && state.cycle === 0}><RotateCcw className="size-4" aria-hidden /> Reiniciar</Button>
        </div>

        <Field label="Estudando">
          <select aria-label="Disciplina do foco" value={state.subjectId ?? ""} disabled={state.status !== "idle" && state.phase === "focus"}
            onChange={(e) => timer.setSubject(e.target.value || null)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <option value="">Sem disciplina</option>
            {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <p className="text-xs text-muted">Só o tempo de foco conta como estudo (mínimo de 1 minuto). Pausas não contam. Se você fechar o app com o foco rodando, a sessão é registrada pelo tempo planejado ao reabrir.</p>
        <DurationForm key={JSON.stringify(config)} timer={timer} />
      </section>

      <Stats sessions={sessions} subjects={subjects} />
    </div>
  );
}

function DurationForm({ timer }: { timer: PomodoroController }) {
  const [v, setV] = useState({ ...timer.config });
  const [err, setErr] = useState<string | null>(null);
  const idle = timer.state.status === "idle";
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) });
  function save(e: React.FormEvent) {
    e.preventDefault();
    const r = ConfigSchema.safeParse(v);
    if (!r.success) return setErr("Use valores inteiros: foco 1–180, descanso curto 1–60, longo 1–120 e ciclo 2–10.");
    setErr(null); timer.setConfig(r.data);
  }
  return (
    <details className="rounded-lg border border-line">
      <summary className="cursor-pointer px-3 py-2 text-sm">Durações</summary>
      <form onSubmit={save} className="grid grid-cols-2 gap-2 p-3">
        {([["focusMin", "Foco (min)"], ["shortMin", "Descanso curto"], ["longMin", "Descanso longo"], ["longEvery", "Focos por ciclo"]] as const).map(([k, label]) => (
          <Field key={k} label={label}><Input type="number" inputMode="numeric" value={v[k]} onChange={set(k)} disabled={!idle} /></Field>
        ))}
        <div className="col-span-2 flex items-center gap-2">
          <Button type="submit" disabled={!idle}>Aplicar</Button>
          <Button type="button" variant="ghost" disabled={!idle} onClick={() => { setV({ ...DEFAULT_CONFIG }); timer.setConfig(DEFAULT_CONFIG); }}>Padrão</Button>
          {!idle && <span className="text-xs text-muted">Disponível com o cronômetro parado.</span>}
        </div>
        {err && <p role="alert" className="col-span-2 text-xs text-danger">{err}</p>}
      </form>
    </details>
  );
}

function Stats({ sessions, subjects }: { sessions: import("@/lib/schemas").StudySession[] | undefined; subjects: import("@/lib/schemas").Subject[] | undefined }) {
  const now = useNow(60_000);
  if (!sessions || !subjects) return <Loading />;
  const today = totalSeconds(sessionsSince(sessions, 1, now));
  const week = sessionsSince(sessions, 7, now);
  const days = secondsPerDay(sessions, 7, now);
  const max = Math.max(1, ...days.map((d) => d.seconds));
  const by = new Map<string | null, number>();
  for (const s of week) by.set(s.subjectId, (by.get(s.subjectId) ?? 0) + s.seconds);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const name = (id: string | null) => subjects.find((s) => s.id === id);

  if (sessions.length === 0) return <EmptyState title="Nenhuma sessão registrada ainda" hint="Inicie um foco: ao concluir (ou encerrar depois de 1 minuto), o tempo aparece aqui." />;
  return (
    <section aria-label="Tempo de estudo" className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-muted">Hoje</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatDuration(today)}</p></div>
        <div className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-muted">Últimos 7 dias</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatDuration(totalSeconds(week))}</p></div>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold">Por dia</h2>
        <ul className="flex h-32 items-end gap-2 rounded-xl border border-line bg-surface p-3" aria-label="Minutos de estudo por dia">
          {days.map((d) => (
            <li key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${formatDuration(d.seconds)}`}>
              <span className="w-full rounded-t bg-accent/80" style={{ height: `${(d.seconds / max) * 100}%`, minHeight: d.seconds ? 3 : 0 }} />
              <span className="text-[10px] text-muted">{WEEKDAY.format(d.day).replace(".", "")}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold">Por disciplina (7 dias)</h2>
        {rows.length === 0 ? <p className="text-sm text-muted">Sem sessões nos últimos 7 dias.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {rows.map(([id, sec]) => (
              <li key={id ?? "none"} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: name(id)?.color ?? "var(--fg-muted)" }} aria-hidden />{name(id)?.name ?? "Sem disciplina"}</span>
                <span className="tabular-nums text-muted">{formatDuration(sec)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
