# StudyFlow — geração de conteúdo com IA

- **Data:** 30 de outubro de 2026
- **Status:** aguardando aprovação do produto
- **Escopo:** geração de flashcards, quizzes e anotações pela conversa e pelas telas de categoria

## Intenção

Transformar a IA do StudyFlow de um assistente que apenas conversa em um assistente capaz de executar ações de estudo dentro do aplicativo. O estudante poderá pedir pela conversa ou iniciar a geração na categoria correspondente. O conteúdo será validado e salvo automaticamente no IndexedDB. Uma notificação discreta permitirá abrir o resultado; a categoria também exibirá um indicador até que o estudante consulte o novo conteúdo.

O comportamento escolhido é **processamento enquanto o aplicativo estiver aberto**, inclusive durante a navegação entre telas. Fechar ou recarregar o navegador interrompe uma geração ativa; o aplicativo registrará que ela foi interrompida e não fingirá que foi concluída.

## Objetivos

1. Criar flashcards, quizzes e anotações a partir de linguagem natural na conversa.
2. Oferecer a mesma geração diretamente nas categorias Flashcards, Quizzes e Anotações.
3. Permitir usar disciplina, documentos, anotações e trechos como contexto, sempre por seleção explícita do estudante.
4. Quando não houver contexto selecionado, permitir adicionar material ou informar o assunto manualmente.
5. Executar geração sem bloquear a navegação entre categorias.
6. Validar os dados gerados antes de persistir e salvar automaticamente.
7. Notificar a conclusão e destacar a categoria correspondente até a consulta do conteúdo.
8. Reaproveitar a integração OpenRouter e as funções locais de persistência existentes.

## Fora de escopo

- Continuar geração depois de fechar o navegador ou quando o aplicativo não estiver aberto.
- Conta de usuário, backend próprio, sincronização entre dispositivos ou fila hospedada.
- Enviar automaticamente todos os documentos/anotações de uma disciplina sem seleção.
- Permitir que o modelo execute SQL, acesse IndexedDB diretamente ou invoque funções arbitrárias.
- Gerar ou alterar tarefas acadêmicas nesta primeira entrega.
- Prévia obrigatória antes de salvar: a decisão aprovada é salvamento automático após validação.

## Abordagens consideradas

### A. Ferramentas nativas da IA — escolhida

A conversa envia ferramentas OpenAI-compatible para o modelo. O modelo solicita uma ação tipada, como `create_flashcards`, `create_quiz` ou `create_note`, com os dados do conteúdo nos argumentos. O aplicativo valida os argumentos e chama uma função local permitida.

**Vantagens:** linguagem natural, fluxo único de conversa, ações explícitas e contratos estruturados. As mesmas funções executoras podem servir à conversa e aos botões das categorias.

**Trade-off:** o streaming atual só lê texto; terá de reconhecer e montar `tool_calls` em chunks, e nem todos os modelos OpenRouter oferecem suporte consistente a ferramentas.

### B. Criação guiada nas categorias

O estudante abre um formulário específico e informa o assunto/contexto. É previsível e simples, mas a interação é menos natural e não atende ao pedido de executar a ação pela conversa.

### C. Classificação de intenção

Uma chamada extra classifica cada mensagem antes de decidir a ação. É flexível, mas acrescenta latência, custo e uma segunda decisão probabilística que pode ser evitada com tool calling.

**Decisão:** implementar A como caminho principal. Para modelos que rejeitem ferramentas, oferecer um fallback guiado (B) na categoria; na conversa, explicar a limitação e oferecer abrir a categoria correspondente. Não interpretar uma resposta em texto comum como autorização implícita para criar conteúdo.

## Experiência do estudante

### Pela conversa

1. O estudante escreve algo como “Crie 12 flashcards sobre herança e polimorfismo usando o material desta disciplina”.
2. O modelo decide se deve responder normalmente ou solicitar uma ferramenta de criação.
3. Se contexto for necessário, o aplicativo utiliza a seleção explícita já existente no chat. Nenhum material fora da seleção é enviado.
4. Se não houver contexto selecionado, o assistente pergunta se o estudante quer adicionar material ou informar o assunto manualmente.
5. Quando a ferramenta retorna conteúdo válido, o aplicativo cria o registro local e confirma na conversa que a criação foi concluída.
6. Se o modelo não suportar tool calling, a conversa informa isso sem executar uma ação improvisada e oferece a criação guiada na categoria.

### Pela categoria

Cada categoria ganha uma ação “Gerar com IA”. Um diálogo comum permite:

- escolher uma disciplina, quando aplicável;
- selecionar documentos, anotações e/ou informações da disciplina;
- adicionar um arquivo/material pela Biblioteca, ou
- informar o assunto manualmente quando nenhum contexto tiver sido escolhido;
- definir quantidade e instruções relevantes.

O conteúdo de contexto é mostrado antes do envio. A ação explícita de geração não autoriza o envio silencioso de materiais não selecionados.

### Geração, salvamento e notificação

- O gerenciador global cria um trabalho com status `queued`, `generating`, `completed`, `failed` ou `interrupted`.
- A primeira versão processa uma geração por vez para limitar chamadas concorrentes e facilitar o estado visível.
- O gerenciador vive no nível de `AppShell`, que permanece montado durante a navegação.
- Ao terminar, o aplicativo valida o resultado, chama o repositório local correspondente e grava o identificador do conteúdo gerado no trabalho.
- O trabalho concluído produz uma notificação/toast discreta, por exemplo: “Olá, [nome]. Seu quiz acabou de ser gerado. Venha conferir!”.
- A notificação é acionável e navega para a categoria; quando útil, abre o conteúdo criado.
- A sidebar mostra um ponto ou contador discreto na categoria com conteúdo novo. O indicador é removido quando o estudante consulta o item.
- Falhas ficam registradas com opção de tentar novamente; uma saída/recarga do navegador marca trabalhos ativos como interrompidos na inicialização seguinte.
- Histórico e notificações permanecem no dispositivo, mesmo após atualizar a página.

## Arquitetura proposta

### 1. Contrato de ferramentas e provedor

Estender o adaptador OpenAI-compatible para aceitar definições de ferramentas e montar os deltas de `tool_calls` durante o streaming, agrupando argumentos por índice/ID e analisando o JSON somente após o término da chamada.

O dispatcher aceitará apenas nomes e payloads conhecidos. O modelo não recebe uma conexão direta ao banco. Tool calls malformados ou não suportados não são executados.

Ferramentas iniciais:

- `create_flashcards`: título e cartões com frente/verso.
- `create_quiz`: título e questões com alternativas e índice da resposta correta.
- `create_note`: título e corpo Markdown.

Na conversa, usar `tool_choice: auto`. Na geração iniciada por uma categoria, restringir a chamada à ferramenta correspondente. Depois de executar, gravar uma resposta amigável na conversa ou atualizar a interface da categoria.

Se o endpoint/modelo responder que não suporta tools, usar fallback guiado. Respostas em texto livre não devem ser tratadas como tool calls.

### 2. Serviço compartilhado de geração

Criar uma camada de domínio independente da interface, com:

- tipos discriminados por formato;
- schemas Zod para payloads gerados, limites de quantidade e tamanho;
- normalização e validação final usando os schemas atuais de Flashcard, Quiz/QuizQuestion e Note;
- dispatcher fechado de ferramentas;
- chamadas aos repositórios existentes: `createFlashcard`, `saveQuiz` e `createNote`;
- retorno tipado contendo tipo, título e ID criado.

A criação em lote deve ser atômica sempre que possível: não deixar um deck/quiz parcial como se estivesse completo. Para flashcards, preferir uma função de lote transacional no repositório.

### 3. Gerenciador global e persistência

Adicionar uma tabela Dexie em uma nova versão do banco (v5) para trabalhos de geração. Registro mínimo:

- ID, tipo de conteúdo, título solicitado e disciplina;
- status, datas de criação/início/conclusão;
- ID do conteúdo criado;
- mensagem de erro;
- data em que o resultado foi consultado.

O gerenciador global mantém a fila em memória enquanto o app está aberto, persiste transições de status e controla o AbortController da geração ativa. Na inicialização, trabalhos que ficaram `queued` ou `generating` são marcados `interrupted`, pois não existe execução persistente no servidor.

### 4. Contexto e privacidade

Reaproveitar a seleção já usada pelo chat (`buildContextItems`) e a confirmação de envio existente. Na categoria, apresentar um seletor de materiais equivalente; permitir texto manual quando não houver contexto. Não inferir que todos os documentos da disciplina estão autorizados.

A chave da OpenRouter continua no armazenamento local atual e não entra no backup. A chamada continua sendo feita pelo navegador, preservando a arquitetura existente. O estudante verá o provedor/modelo e o contexto antes do primeiro envio ou sempre que material estiver selecionado, respeitando a política de consentimento atual.

### 5. Notificações e navegação

Criar um componente global de notificações conectado aos trabalhos persistidos. A notificação de conclusão deve ter texto curto, tipo de conteúdo, ação “Abrir” e dispensar. A sidebar consulta trabalhos concluídos ainda não vistos e mostra um indicador por categoria. Marcar como visto somente ao abrir o conteúdo correspondente, não ao dispensar o toast.

### 6. Integração nas telas

Adicionar entrada “Gerar com IA” em Flashcards, Quizzes e Anotações. O diálogo de geração compartilha seletor de contexto e opções comuns; os campos específicos (quantidade de cartões, número de questões, formato da anotação) variam por tipo. Depois de salvar, as consultas reativas existentes (Dexie hooks) atualizam as listas.

## Privacidade, segurança e robustez

- Nunca executar funções arbitrárias indicadas pelo modelo.
- Validar todo argumento com Zod e validar novamente o registro no repositório.
- Limitar quantidade, comprimento e número de alternativas por conteúdo.
- Respeitar limite de contexto da IA e indicar conteúdo truncado.
- Não persistir conteúdo parcial como resultado concluído.
- Não expor chave ou cabeçalhos da OpenRouter em logs/toasts.
- Impedir duplo clique e execução duplicada do mesmo trabalho.
- Tratar limite de taxa, falta de créditos, erro do modelo, JSON inválido, tool call não suportado, cancelamento e perda de conexão.
- Manter conteúdo gerado local ao dispositivo.

## Critérios de aceitação

1. Um pedido explícito na conversa gera o tipo correto de conteúdo, sem exigir mudança prévia de tela.
2. Os três botões de categoria iniciam a mesma geração central, sem lógica duplicada.
3. O usuário pode escolher materiais ou informar um assunto manualmente; nada é enviado por seleção implícita.
4. Trocar de tela durante a geração não interrompe o trabalho.
5. Um resultado válido é salvo automaticamente no IndexedDB e aparece na lista sem recarregar a página.
6. Conclusão gera toast acionável e indicador na categoria correspondente.
7. Abrir o conteúdo remove o indicador; dispensar o toast não o remove.
8. Erros e trabalhos interrompidos são apresentados honestamente e podem ser tentados novamente.
9. Modelos sem tool calling recebem fallback guiado na categoria e nunca geram ações a partir de texto livre não validado.
10. Testes cobrem parsing de tool calls parciais, validação Zod, dispatcher autorizado, salvamento em lote, ciclo de status, deduplicação, navegação e recuperação de trabalhos interrompidos.

## Testes e validação

- Testes unitários do parser SSE com tool calls divididas em vários chunks, múltiplas ferramentas e JSON inválido.
- Testes dos schemas e do dispatcher, inclusive nomes de ferramenta desconhecidos e limites excedidos.
- Testes de repositório para gravação em lote e integridade de quiz/flashcards/anotação.
- Testes do gerenciador para fila, falhas, retry, interrupção e atualização de status.
- Testes dos indicadores/toasts e navegação até o item criado.
- Mock de fetch/OpenRouter; não usar chave real em testes automatizados.
- Executar `npm test`, `npm run lint` e `npm run build` antes de considerar a implementação pronta.

## Decisões tomadas e pontos a confirmar

**Decisões já tomadas pelo estudante:**

- Adotar tool calling nativo (A) como entrada principal, com fallback guiado (B) para modelos sem suporte adequado.
- Gerar enquanto o aplicativo estiver aberto, inclusive ao navegar entre telas.
- Salvar automaticamente após validação e notificar a conclusão.

**Padrões propostos para a primeira versão:**

- Uma geração por vez, em fila FIFO.
- Toast no canto inferior direito em desktop; adaptação para telas menores.
- Histórico local de gerações e notificações, sem serviço remoto.
- Ação “Gerar com IA” abre um diálogo de contexto compartilhado nas três categorias.

Esses padrões fazem parte da proposta e podem ser corrigidos durante a aprovação do documento.
