import { z } from "zod";
import { createLocalStore } from "./local-store";

const SidebarSchema = z.object({ pinned: z.boolean().default(true) });
export type SidebarPref = z.infer<typeof SidebarSchema>;

/** Barra lateral expandida por padrão. v3 ignora o estado recolhido salvo pelas versões anteriores para evitar iniciar apenas como trilho de hover; a nova escolha fica salva no dispositivo. */
export const sidebarStore = createLocalStore<SidebarPref>("studyflow.sidebar.v3", (raw) => {
  const r = SidebarSchema.safeParse(raw ?? {});
  return r.success ? r.data : SidebarSchema.parse({});
});
