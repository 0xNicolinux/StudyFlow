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
  { color: "#818cf8", label: "Índigo" },
  { color: "#22c55e", label: "Esmeralda" },
  { color: "#fb923c", label: "Pêssego" },
  { color: "#e879f9", label: "Orquídea" },
  { color: "#38bdf8", label: "Céu" },
  { color: "#f43f5e", label: "Coral" },
  { color: "#a3e635", label: "Verde-limão" },
  { color: "#14b8a6", label: "Jade" },
] as const;

export const DEFAULT_ACCENT = "#9fe9f7";
export const DEFAULT_THEME_MODE = "dark" as const;
export const DEFAULT_DENSITY = "comfortable" as const;

export type ThemeMode = "light" | "dark" | "system";
export type InterfaceDensity = "comfortable" | "compact";
export type ThemePreferences = {
  accent: string;
  mode: ThemeMode;
  density: InterfaceDensity;
};

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

export const themeStore = createLocalStore<ThemePreferences>("studyflow.theme.v1", (raw: unknown) => {
  const value = typeof raw === "object" && raw !== null
    ? raw as Partial<ThemePreferences>
    : {};

  return {
    accent: isHexColor(value.accent) ? value.accent.toLowerCase() : DEFAULT_ACCENT,
    mode: value.mode === "light" || value.mode === "system" || value.mode === "dark"
      ? value.mode
      : DEFAULT_THEME_MODE,
    density: value.density === "compact" || value.density === "comfortable"
      ? value.density
      : DEFAULT_DENSITY,
  };
});
