# StudyFlow

Ambiente de estudos local-first (Next.js, TypeScript, Tailwind, Dexie, Zod). Dados ficam no navegador; sem servidor.

## Comandos
- `npm run dev` — desenvolvimento (o service worker só é registrado em produção)
- `npm test` — testes da camada de dados e do backup (Vitest + fake-indexeddb)
- `npm run build` — exportação estática em `out/` (pronta para a Vercel)
- E2E de navegador: sirva `out/` na porta 4173 (`cd out && python3 -m http.server 4173`) e rode `python3 e2e.py` (requer Playwright)

## Status
Veja o resumo da entrega no chat: o que está implementado e o que ainda é apenas planejado.
