"use client";
import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, SETTINGS_EVENT, loadSettings, type AiSettings } from "@/lib/ai/settings";

const subscribe = (cb: () => void) => {
  window.addEventListener(SETTINGS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(SETTINGS_EVENT, cb); window.removeEventListener("storage", cb); };
};
const serverSnapshot = JSON.stringify(DEFAULT_SETTINGS);

/** Lê as configurações de IA sem divergir entre o HTML estático e o cliente (evita erro de hidratação). */
export function useAiSettings(): AiSettings {
  const raw = useSyncExternalStore(subscribe, () => JSON.stringify(loadSettings()), () => serverSnapshot);
  return useMemo(() => JSON.parse(raw) as AiSettings, [raw]);
}
