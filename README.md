# StudyFlow

Ambiente de estudos local-first (Next.js, TypeScript, Tailwind, Dexie, Zod). Dados ficam no navegador; sem servidor.

## Comandos
- `npm run dev` — desenvolvimento (o service worker só é registrado em produção)
- `npm test` — testes unitários (dados, backup, IA, SRS, Pomodoro, extração de PDF com fixtures reais)
- `npm run build` — exportação estática em `out/` (pronta para a Vercel). O `prebuild` copia o worker do pdfjs para `public/` (arquivo ignorado pelo git).
- Testes de navegador (Playwright): sirva `out/` (`cd out && python3 -m http.server 4177`) e rode, com a constante `URL` ajustada à porta:
  `e2e.py` (geral), `e2e-ai.py` (IA com OpenRouter **simulado**), `e2e-study.py` (foco, flashcards, quizzes, biblioteca, backup) e `e2e-offline.py` (importar PDF sem internet).

## Status
Etapas 1–7 implementadas e verificadas, exceto o que está em "Limitações".

## Limitações conhecidas
- Nunca testado contra o OpenRouter real (sem chave no ambiente de desenvolvimento): o CORS e os modelos reais precisam de conferência manual.
- PDFs escaneados (só imagem) não têm texto extraível: OCR não é suportado. PDFs protegidos por senha não são lidos.
- Documentos: no máximo 30 MB por arquivo, 400 páginas e 2 milhões de caracteres de texto extraído por documento.
- Sessão de foco com o app fechado: ao reabrir, é registrada pelo tempo planejado.
- Dados e chave de API ficam apenas no navegador (sem sincronização entre dispositivos).

## IA (OpenRouter ou endpoint compatível com OpenAI)
Configure em Configurações → Inteligência artificial: chave própria, modelo e (opcional) endpoint. A chave fica no `localStorage`,
fora do IndexedDB e fora do backup. Nada é enviado sem confirmação; o conteúdo exato (mensagem, anotações selecionadas, histórico)
é mostrado antes do envio. Sem chave, o app segue funcionando e o chat avisa que a IA não está configurada.
