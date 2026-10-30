import { createLocalStore } from "./local-store";

export const DEFAULT_ACCENT = "#9fe9f7";
export const DEFAULT_THEME_MODE = "dark" as const;
export const DEFAULT_DENSITY = "comfortable" as const;

export type ThemeMode = "light" | "dark";
export type InterfaceDensity = "comfortable" | "compact";
export type ThemePreferences = {
  mode: ThemeMode;
  density: InterfaceDensity;
};

export const themeStore = createLocalStore<ThemePreferences>("studyflow.theme.v1", (raw: unknown) => {
  const value = typeof raw === "object" && raw !== null
    ? raw as Partial<ThemePreferences>
    : {};

  return {
    mode: value.mode === "light" ? "light" : DEFAULT_THEME_MODE,
    density: value.density === "compact" ? "compact" : DEFAULT_DENSITY,
  };
});
