export type ChatRole = "system" | "user" | "assistant";
export type ChatTurn = { role: ChatRole; content: string };

export type AiErrorKind =
  | "no_key" | "no_model" | "offline" | "network" | "auth" | "forbidden"
  | "credits" | "rate_limit" | "bad_request" | "server" | "stream" | "aborted";

export class AiError extends Error {
  constructor(public kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
  }
}

export type StreamRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatTurn[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

/** Contrato de um provedor: qualquer backend compatível implementa streamChat. */
export interface AiProvider {
  id: string;
  label: string;
  defaultBaseUrl: string;
  editableEndpoint: boolean;
  streamChat(req: StreamRequest): AsyncGenerator<string, void, void>;
}
