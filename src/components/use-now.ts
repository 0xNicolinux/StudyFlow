"use client";
import { useEffect, useState } from "react";

/** Horário atual como estado (atualizado periodicamente), para não chamar Date.now() durante a renderização. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
