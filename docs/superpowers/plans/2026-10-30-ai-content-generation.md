# AI Content Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Generate flashcards, quizzes, and notes from chat tool calls or category actions, save validated results locally, and notify the student.

**Architecture:** Extend the existing OpenAI-compatible streaming adapter with structured tool-call events; route only allowlisted generation tools through a shared Zod-validated local service. Persist generation jobs in a new Dexie table and keep a global queue/notification UI mounted in AppShell.

**Tech Stack:** Next.js 16, React 19, TypeScript, Dexie, Zod, Vitest, OpenRouter Chat Completions SSE.

**Spec:** `docs/superpowers/specs/2026-10-30-ai-content-generation-design.md`

## Global Constraints

- Generation runs only while the app is open and must continue when navigating between categories.
- Save content automatically only after complete structured output passes validation.
- User-selected context is the only context sent; no implicit whole-discipline upload.
- The model may invoke only the three allowlisted creation tools; it never receives direct database access.
- Keep OpenRouter credentials in the existing local settings store and out of logs/backups.
- Models without tool support use the guided category fallback; plain text must never be interpreted as an executable tool call.
- Use existing local repository functions and Dexie/IndexedDB; no new hosted service or dependency.

## Review Focus

- SSE tool-call arguments split across arbitrary chunks, including escaped JSON and multiple tool indexes.
- Models that return content plus tool calls or finish with unsupported/invalid tool-call payloads.
- Duplicate tool calls / retry races must not create duplicate decks, quizzes, or notes.
- Closing/reloading while a job is active must mark it interrupted, never completed.
- Marking a notification read must be scoped to its target category/item and must not happen when only dismissing the toast.

---

### Task 1: Typed tool-call stream protocol

**Files:**
- Modify: `src/lib/ai/types.ts`
- Modify: `src/lib/ai/openai-compatible.ts`
- Modify: `src/lib/ai/ai.test.ts`

**Interfaces:**
- Add `ToolDefinition`, `ToolCall`, and discriminated `ChatStreamEvent` types.
- Extend `StreamRequest` with optional `tools` and `toolChoice`.
- Change provider streaming to emit `{ type: "text"; text: string }` and completed `{ type: "tool_call"; id; name; arguments }` events. Preserve ordinary text-only usage by updating consumers.

- [ ] Add tests for one text chunk, a tool call whose JSON arguments arrive in many SSE chunks, multiple calls by index, a malformed argument payload, and existing text-only responses.
- [ ] Run the AI test file and confirm new assertions fail for missing event support.
- [ ] Implement SSE accumulation of `tool_calls[index].id/function.name/function.arguments`; emit a tool-call event only after the stream ends and the arguments parse as JSON. Keep finish reasons and provider errors explicit.
- [ ] Run `npm test -- src/lib/ai/ai.test.ts`.

### Task 2: Validated generation contracts and persistence services

**Files:**
- Create: `src/lib/ai/generation.ts`
- Create: `src/lib/ai/generation.test.ts`
- Modify: `src/lib/study-repo.ts`
- Modify: `src/lib/repo.ts`

**Interfaces:**
- Export `GenerationKind = "flashcards" | "quiz" | "note"`.
- Export `GenerationToolDefinitions` and `dispatchGenerationTool(input, subjectId)`.
- Return `{ kind, title, contentId, count }` after a successful atomic save.
- Tool schemas: flashcards `{ title, cards: [{ front, back }] }`; quiz `{ title, questions: [{ prompt, options, answer }] }`; note `{ title, body }`.

- [ ] Test accepted tool payloads, unknown tool names, invalid fields, limits, and each persisted content kind.
- [ ] Run generation tests and confirm the dispatcher is missing.
- [ ] Implement bounded Zod inputs and a closed dispatcher; validate with existing domain schemas before persistence.
- [ ] Add a transactional bulk flashcard creation function; keep quiz and note persistence through existing repositories.
- [ ] Run `npm test -- src/lib/ai/generation.test.ts src/lib/study.test.ts src/lib/repo.test.ts`.

### Task 3: Persistent generation job store and queue

**Files:**
- Modify: `src/lib/schemas.ts`
- Modify: `src/lib/db.ts`
- Create: `src/lib/generation-jobs.ts`
- Create: `src/lib/generation-jobs.test.ts`

**Interfaces:**
- Add `GenerationJobSchema` and `GenerationJob` with id, kind, title, subjectId, status, createdAt, startedAt, completedAt, contentId, count, error, and viewedAt.
- Upgrade Dexie to v5 with `generationJobs: "id, status, kind, subjectId, createdAt, completedAt, viewedAt"`.
- Export enqueue/update/list/mark-viewed/recover-interrupted helpers.

- [ ] Test the full state transition, queue order, error persistence, duplicate completion protection, viewed state, and interrupted-job recovery.
- [ ] Run job tests and confirm missing table/service behavior.
- [ ] Implement validated transitions and recover persisted queued/generating jobs as interrupted at startup.
- [ ] Run `npm test -- src/lib/generation-jobs.test.ts`.

### Task 4: Global queue runner, toasts, and sidebar indicators

**Files:**
- Create: `src/components/generation-provider.tsx`
- Create: `src/components/generation-toasts.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/sidebar.tsx`
- Modify: `src/components/chat-context.tsx` only if exposing generation actions there is required.

**Interfaces:**
- Provider exposes enqueue, jobs, busy state, retry, dismiss, and mark-viewed actions.
- One FIFO job runs at a time while AppShell is mounted.
- Completion toast navigates to the relevant category/item; dismissing does not mark the job as viewed.
- Sidebar shows an unread marker for completed jobs until the created item is opened.

- [ ] Test state selectors for unread-by-kind and ensure dismiss does not set viewedAt.
- [ ] Run job/UI tests and confirm they fail before provider integration.
- [ ] Implement global runner with AbortController, startup recovery, Dexie live updates, accessible toast buttons, and category markers.
- [ ] Run relevant tests and `npm run lint`.

### Task 5: Category entry points and context selection

**Files:**
- Create: `src/components/generation-dialog.tsx`
- Modify: `src/components/flashcards-panel.tsx`
- Modify: `src/components/quizzes-panel.tsx`
- Modify: `src/components/notes-panel.tsx`
- Modify: `src/components/generation-provider.tsx`

**Interfaces:**
- Shared dialog accepts a fixed generation kind, optional subjectId, and enqueue callback.
- Student can select current discipline metadata, existing notes, and ready documents, or enter a manual subject/instruction.
- No context selected -> ask whether to choose/add materials or enter a subject manually; never auto-send all.
- On enqueue, store only the request metadata and chosen context snapshot needed for the local task.

- [ ] Test no-context flow, selected-context flow, manual-topic flow, and category-specific limits/defaults.
- [ ] Run targeted UI tests and confirm the entry point is absent.
- [ ] Implement “Gerar com IA” actions in all three categories using the shared dialog.
- [ ] Run `npm run lint` and relevant tests.

### Task 6: Chat tool calling and fallback behavior

**Files:**
- Modify: `src/components/use-chat.ts`
- Modify: `src/components/chat-view.tsx`
- Modify: `src/components/composer.tsx`
- Modify: `src/components/generation-provider.tsx`
- Modify: `src/lib/ai/generation.ts`
- Modify: `src/lib/ai/ai.test.ts` or create a focused chat-generation test.

**Interfaces:**
- Add `send` flow that supplies the three tool definitions with `tool_choice: "auto"`.
- Completed tool calls go through the shared dispatcher and enqueue/save via the generation service.
- Persist a human-readable completion message in the existing conversation; do not persist raw tool arguments as assistant prose.
- Tool incompatibility displays an actionable guided-category fallback and never interprets plain text as execution.
- Continue respecting current explicit context consent/confirmation.

- [ ] Test a tool call through chat, invalid tool call rejection, unsupported-tool fallback, and normal chat without tools.
- [ ] Run targeted chat/AI tests and confirm behavior fails before integration.
- [ ] Implement tool-call orchestration and completion acknowledgement.
- [ ] Run `npm test` and `npm run lint`.

### Task 7: End-to-end verification and docs

**Files:**
- Modify: `README.md`
- Modify: relevant tests from Tasks 1–6.

- [ ] Verify criteria from the design spec: chat + category entry, explicit context, navigation during generation, automatic save, notification/marker lifecycle, model fallback, and interrupted recovery.
- [ ] Run `npm test`, `npm run lint`, and `npm run build`.
- [ ] Review the full branch for privacy, duplicate execution, hook lifecycle, keyboard accessibility, and error handling.
- [ ] Update README AI feature/limitations.
- [ ] Leave branch ready for review; do not merge into main without the student's integration decision.
