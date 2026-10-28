"use client";
import { createContext, useContext } from "react";
import type { ChatController } from "./use-chat";

/** Permite que a biblioteca adicione documentos/trechos ao contexto do chat sem passar props por todos os painéis. */
export const ChatCtx = createContext<ChatController | null>(null);
export const useChatContext = () => useContext(ChatCtx);
