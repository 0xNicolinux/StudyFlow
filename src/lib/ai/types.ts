export type ChatRole = "system" | "user" | "assistant";
export type ChatTurn = { role: ChatRole; content: string };

export type AiErrorKind =
  | "no_key" | "no_model" | "offline" | "network" | "auth" | "forbidden"
  | "credits" | "rate_limit" | "bad_request" | "server" | "stream" | "aborted" | "tools_unsupported" | "tool_call_invalid";

export class AiError extends Error {
  constructor(public kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
  }
}

export type ToolDefinition = {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown>; strict?: boolean };
};
export type ToolChoice = "auto" | "none" | "required" | { type: "function"; function: { name: string } };
export type ToolCall = { id: string; name: string; arguments: unknown };
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | ({ type: "tool_call" } & ToolCall);

export type StreamRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatTurn[];
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

/** Contrato de um provedor: qualquer backend compatível implementa streamChat. */
export interface AiProvider {
  id: string;
  label: string;
  defaultBaseUrl: string;
  editableEndpoint: boolean;
  streamChat(req: StreamRequest): AsyncGenerator<ChatStreamEvent, void, void>;
}
