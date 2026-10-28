"use client";
import { useEffect } from "react";
import { loadPdfLib } from "@/lib/docs";

/** Registra o service worker (somente em produção) e pede o cache dos recursos já carregados pela página. */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(async (reg) => {
        // Baixa o leitor de PDF agora para que importar PDFs também funcione offline depois da primeira visita.
        await loadPdfLib().catch(() => undefined);
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin));
        reg.active?.postMessage({ type: "CACHE_URLS", urls: [location.href, ...urls] });
      })
      .catch(() => { /* PWA é um acréscimo: falha no registro não deve quebrar o app */ });
  }, []);
  return null;
}
