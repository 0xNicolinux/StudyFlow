# StudyFlow

**StudyFlow** é um ambiente de estudos local-first, desenvolvido para organizar disciplinas, materiais, tarefas, revisões e sessões de foco em um único espaço. Os dados de estudo são armazenados no próprio navegador, sem exigir conta ou servidor para o uso principal.

## Visão geral

A aplicação combina organização acadêmica, leitura de materiais, acompanhamento de atividades e ferramentas de concentração. A interface é organizada em torno de disciplinas e áreas de estudo, com personalização local e recursos opcionais de inteligência artificial.

- **Página inicial:** ponto de entrada para o ambiente de estudos.
- **Ambiente de estudo:** disponível em `/study`.
- **Landing page:** página minimalista com animação de tubarões ASCII, baseada em [ascii-sharks](https://github.com/stackedlol/ascii-sharks). Os arquivos correspondentes e sua licença estão em `src/lib/ascii-sharks/`.

## Principais recursos

### Organização acadêmica

- Organização do conteúdo por disciplina.
- Tarefas, avaliações, revisões e indicadores de estudo.
- Conversas separadas por disciplina e conversas gerais.
- Sugestões locais para retomar atividades e priorizar tarefas.

### Personalização

- Temas claro, escuro ou conforme o sistema, com preferência salva no dispositivo.
- Paleta ampliada de cores, incluindo escolha personalizada e acentos específicos por disciplina.
- Densidade da interface configurável, com espaçamento confortável ou compacto.
- Perfil do estudante separado das configurações.
- Foto ou avatar animado e capa de perfil, com limites de tamanho documentados na interface.
- Barra lateral adaptável, com opção de fixar a expansão.
- Ordenação adaptativa de painéis e abas a partir do histórico de uso armazenado no dispositivo.

### Leitura e materiais

- Biblioteca de documentos com extração de texto selecionável de PDFs.
- Visualização e organização de materiais de estudo.
- Integração de fórmulas e conteúdo Markdown na experiência de estudo.

**Limitações de PDF:** a extração é baseada em texto selecionável; OCR não está implementado. PDFs escaneados ou compostos apenas por imagens não são interpretados. Fórmulas, tabelas, colunas e diagramas podem perder parte da formatação durante a extração. Confira o conteúdo extraído antes de utilizá-lo em atividades ou enviá-lo à IA.

Limites documentados por arquivo: 30 MB, 400 páginas e 2 milhões de caracteres de texto extraído.

### Foco e acompanhamento

- Sessões de foco com Pomodoro.
- Revisões e acompanhamento de progresso.
- Registro local de preferências e atividade de navegação.

### Inteligência artificial (opcional)

A aplicação pode ser configurada para utilizar o OpenRouter ou um endpoint compatível com a API da OpenAI. O usuário define a chave, o modelo e, opcionalmente, o endpoint em **Configurações → Inteligência artificial**.

- A aplicação funciona sem configurar uma chave.
- O envio de conteúdo exige confirmação.
- O conteúdo que será enviado é apresentado antes do envio.
- A chave fica no `localStorage`, separada do IndexedDB e do backup de estudos.

A comunicação com o provedor de IA é externa à arquitetura local-first; revise o conteúdo antes de confirmar qualquer envio.

## Armazenamento e privacidade

O StudyFlow não exige login e não oferece sincronização entre dispositivos nesta versão.

| Dados | Armazenamento |
|---|---|
| Conteúdo de estudo | IndexedDB, por meio de Dexie; incluído no backup. |
| Preferências de interface | `localStorage`. |
| Histórico usado pela personalização adaptativa | Armazenamento local no dispositivo; fora do backup. |
| Chave e configuração de IA | `localStorage`; a chave não é incluída no backup. |

O mural e as publicações do perfil são locais ao dispositivo. Não há publicação pública, interação entre contas ou sincronização social nesta versão.

## Tecnologias

- **Next.js 16** e **React 19** — aplicação web.
- **TypeScript** — tipagem estática.
- **Tailwind CSS 4** — estilos.
- **Dexie / IndexedDB** — persistência local dos dados de estudo.
- **Zod** — validação de dados.
- **PDF.js** — extração de texto de documentos PDF.
- **KaTeX**, **remark-math** e **rehype-katex** — renderização de fórmulas.
- **React Markdown** e **remark-gfm** — conteúdo Markdown.
- **Vitest** — testes unitários.

## Executar localmente

### Requisitos

- Node.js compatível com a versão do Next.js utilizada.
- npm.

### Instalação

~~~bash
git clone https://github.com/0xNicolinux/StudyFlow.git
cd StudyFlow
npm install
~~~

### Desenvolvimento

~~~bash
npm run dev
~~~

O script `predev` sincroniza o worker do PDF.js para a pasta pública antes de iniciar o servidor.

### Testes e validação

~~~bash
npm test
npm run lint
~~~

### Build

~~~bash
npm run build
~~~

O script `prebuild` também sincroniza o worker do PDF.js antes do build.

## Testes

A suíte automatizada mantida utiliza Vitest e cobre áreas como dados, backup, IA, revisão espaçada (SRS), Pomodoro e extração de PDFs com arquivos de teste.

A antiga suíte E2E em Python foi removida por depender de URLs, portas e seletores desatualizados. Testes de navegador com Playwright ainda são uma possibilidade de evolução separada, não parte da suíte atual.

## Limitações conhecidas

- A integração com OpenRouter não foi validada contra o serviço real neste ambiente de desenvolvimento; CORS e comportamento de modelos reais precisam de validação com configuração própria.
- PDFs escaneados, protegidos por senha ou corrompidos não são processados pela extração atual.
- Uma sessão de foco que termina com o aplicativo fechado é registrada ao reabrir com base no tempo planejado.
- Dados locais não são sincronizados entre dispositivos.
- O envio para IA depende de configuração e confirmação explícita do usuário.

## Status do projeto

O StudyFlow é um projeto em evolução. As funcionalidades descritas representam o escopo documentado no repositório; limitações e integrações externas devem ser consideradas ao avaliar o uso.