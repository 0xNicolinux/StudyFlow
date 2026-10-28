"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sidebarStore } from "@/lib/sidebar-pref";
import { useLocalStore } from "./use-local-store";

// Pequena intenção antes de abrir evita expansões por um mouse apenas de passagem; fechar com atraso evita "piscar".
const OPEN_DELAY = 80;
const CLOSE_DELAY = 220;

/**
 * Estado da barra lateral no desktop.
 * - fixada: sempre expandida, mesmo com o mouse fora;
 * - desafixada: trilho de ícones que expande enquanto o mouse (ou o foco do teclado) estiver sobre ela.
 */
export function useSidebar() {
  const { pinned } = useLocalStore(sidebarStore);
  const [hover, setHover] = useState(false);
  const [inside, setInside] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);
  // Só liga as transições depois da primeira pintura: quem deixou a barra desafixada não vê ela "encolher" ao abrir o app.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const togglePin = useCallback(() => sidebarStore.set((s) => ({ ...s, pinned: !s.pinned })), []);

  const handlers = {
    // Toque e caneta não têm "passar por cima": nesses casos o trilho só expande por foco ou ao fixar.
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(timer.current);
      setInside(true);
      timer.current = setTimeout(() => setHover(true), OPEN_DELAY);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(timer.current);
      setInside(false);
      timer.current = setTimeout(() => setHover(false), CLOSE_DELAY);
    },
    // Só foco por teclado expande: clicar com o mouse também foca o botão, e isso não deve manter a barra aberta.
    onFocus: (e: React.FocusEvent) => { if ((e.target as HTMLElement).matches(":focus-visible")) setFocusOpen(true); },
    onBlur: (e: React.FocusEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusOpen(false); },
  };

  return { pinned, expanded: pinned || hover || focusOpen, pointerInside: inside, animate, togglePin, handlers };
}
