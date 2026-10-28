# StudyFlow

Ambiente de estudos local-first (Next.js, TypeScript, Tailwind, Dexie, Zod). Dados ficam no navegador; sem servidor.

## Comandos
- `npm run dev` — desenvolvimento (o service worker só é registrado em produção)
- `npm test` — testes unitários (dados, backup, IA, SRS, Pomodoro, extração de PDF com fixtures reais)
- `npm run build` — exportação estática em `out/` (pronta para a Vercel). O `prebuild` copia o worker do pdfjs para `public/` (arquivo ignorado pelo git).
- Testes de navegador (Playwright): sirva `out/` (`cd out && python3 -m http.server 4177`) e rode, com a constante `URL` ajustada à porta:
  `e2e.py` (geral), `e2e-ai.py` (IA com OpenRouter **simulado**), `e2e-study.py` (foco, flashcards, quizzes, biblioteca, backup), `e2e-offline.py` (importar PDF sem internet) e `e2e-sidebar.py` (fixar/trilho da barra lateral, personalização e conversas por disciplina).

## Status
Etapas 1–7 implementadas e verificadas, exceto o que está em "Limitações".

## Limitações conhecidas
- Nunca testado contra o OpenRouter real (sem chave no ambiente de desenvolvimento): o CORS e os modelos reais precisam de conferência manual.
- A Biblioteca extrai texto selecionável, não a página visual do PDF. PDFs escaneados/fotos não funcionam porque OCR não é suportado; PDFs protegidos por senha ou corrompidos não são lidos. Fórmulas, tabelas, colunas e diagramas podem perder a formatação — confira o texto extraído antes de estudar ou enviá-lo à IA.
- Documentos: no máximo 30 MB por arquivo, 400 páginas e 2 milhões de caracteres de texto extraído por documento.
- Sessão de foco com o app fechado: ao reabrir, é registrada pelo tempo planejado.
- Dados e chave de API ficam apenas no navegador (sem sincronização entre dispositivos).

## IA (OpenRouter ou endpoint compatível com OpenAI)
Configure em Configurações → Inteligência artificial: chave própria, modelo e (opcional) endpoint. A chave fica no `localStorage`,
fora do IndexedDB e fora do backup. Nada é enviado sem confirmação; o conteúdo exato (mensagem, anotações selecionadas, histórico)
é mostrado antes do envio. Sem chave, o app segue funcionando e o chat avisa que a IA não está configurada.

## Barra lateral, personalização e conversas
- **Barra lateral (desktop):** o botão de fixar (alfinete) mantém a barra expandida mesmo com o mouse fora. Desafixada, ela recolhe para um trilho de ícones e expande por cima do conteúdo ao passar o mouse pela borda (ou ao focar com o Tab). O estado do botão e a escolha ficam salvos no dispositivo. No celular continua o menu em gaveta.
- **Personalização adaptativa:** o app registra, só no aparelho, quais painéis e disciplinas você abre. Com isso ele (1) reordena os painéis do menu, as abas de cada disciplina e os indicadores do Início; (2) mostra "Sugestões para agora" (tarefas atrasadas, avaliação próxima sem quiz, revisões, retomar a última disciplina, foco); (3) usa a cor da disciplina como acento da área de trabalho e sugere a cor menos usada ao criar uma nova. O menu só se reordena quando o mouse sai dele, e as abas só ao abrir a disciplina, para nada se mover sob o cursor. Configurações → Personalização apaga esse histórico.
- **Conversas:** cada disciplina tem suas próprias conversas independentes (e fora delas há as "gerais"). O ícone de balão no topo abre as conversas do contexto atual; "Limpar histórico" e "Excluir conversa" só afetam esse contexto.
- **Onde ficam os dados:** conteúdo de estudo no IndexedDB (entra no backup); preferências de interface e histórico de uso no `localStorage` (chaves `studyflow.sidebar.v1` e `studyflow.adaptive.v1`, fora do backup). Nada exige login e nada é sincronizado; o único tráfego externo é a IA opcional, sempre com confirmação.
