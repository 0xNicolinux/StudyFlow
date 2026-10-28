"use client";
import { useSyncExternalStore } from "react";
import type { LocalStore } from "@/lib/local-store";

/** Lê um LocalStore sem divergir entre o HTML estático e o cliente (o servidor usa o valor inicial). */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, () => store.initial);
}
