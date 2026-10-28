import { createLocalStore } from "./local-store";

export const ACCENT_OPTIONS = [
  { color: "#9fe9f7", label: "Gelo" },
  { color: "#a78bfa", label: "Violeta" },
  { color: "#60a5fa", label: "Azul" },
  { color: "#34d399", label: "Menta" },
  { color: "#fbbf24", label: "Âmbar" },
  { color: "#fb7185", label: "Rosa" },
  { color: "#f97316", label: "Laranja" },
  { color: "#c4b5fd", label: "Lavanda" },
  { color: "#2dd4bf", label: "Turquesa" },
  { color: "#f472b6", label: "Pink" },
  { color: "#bef264", label: "Lima" },
  { color: "#e5e7eb", label: "Prata" },
] as const;

export const DEFAULT_ACCENT = "#9fe9f7";

export const themeStore = createLocalStore("studyflow.theme.v1", (raw: unknown) => {
  const value = typeof raw === "object" && raw !== null && "accent" in raw
    ? (raw as { accent?: unknown }).accent
    : undefined;
  return { accent: typeof value === "string" && ACCENT_OPTIONS.some((o) => o.color === value) ? value : DEFAULT_ACCENT };
});
