"use client";
import { adaptiveStore, recordPanel, recordSubject, forgetSubject, EMPTY_ADAPTIVE, type PanelId } from "@/lib/adaptive";
import { useLocalStore } from "./use-local-store";

export const useAdaptive = () => useLocalStore(adaptiveStore);

export const trackPanel = (panel: PanelId, subjectId?: string | null) => adaptiveStore.set((s) => recordPanel(s, panel, Date.now(), subjectId));
export const trackSubject = (id: string) => adaptiveStore.set((s) => recordSubject(s, id, Date.now()));
export const untrackSubject = (id: string) => adaptiveStore.set((s) => forgetSubject(s, id));
export const resetAdaptive = () => adaptiveStore.set(EMPTY_ADAPTIVE);
