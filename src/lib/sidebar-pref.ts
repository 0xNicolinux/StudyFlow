import { z } from "zod";
import { createLocalStore } from "./local-store";

const SidebarSchema = z.object({ pinned: z.boolean().default(true) });
export type SidebarPref = z.infer<typeof SidebarSchema>;

/** Barra lateral fixa (expandida) por padrão, como era antes; o estado escolhido fica salvo no dispositivo. */
export const sidebarStore = createLocalStore<SidebarPref>("studyflow.sidebar.v1", (raw) => {
  const r = SidebarSchema.safeParse(raw ?? {});
  return r.success ? r.data : SidebarSchema.parse({});
});
