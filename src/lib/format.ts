const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
export const formatDay = (ms: number) => fmt.format(new Date(ms));
export const isOverdue = (ms: number | null, done: boolean) => !done && ms !== null && ms < new Date().setHours(0, 0, 0, 0);
/** Converte "YYYY-MM-DD" em timestamp local ao meio-dia (evita saltar de dia por fuso). */
export const dateInputToMs = (v: string) => (v ? new Date(`${v}T12:00:00`).getTime() : null);
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
