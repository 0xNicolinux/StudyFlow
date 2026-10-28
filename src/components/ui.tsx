"use client";
import { X } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "subtle" };
export function Button({ variant = "subtle", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variant === "primary" && "bg-accent text-accent-fg hover:brightness-110",
        variant === "subtle" && "bg-surface-2 text-fg hover:bg-surface-3 border border-line",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-surface-2",
        variant === "danger" && "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30",
        className,
      )}
    />
  );
}

export function IconButton({ label, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      className={cn("inline-flex size-8 items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors", className)}
    />
  );
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cn("w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none", className)}
    />
  );
}

export function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {error && <span role="alert" className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" className="space-y-3" aria-live="polite">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />)}
    </div>
  );
}

/** Modal baseado em <dialog> nativo: foco preso, Esc fecha, acessível por padrão. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cn("m-auto max-h-[90dvh] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg backdrop:bg-black/60", wide ? "w-[min(94vw,52rem)]" : "w-[min(92vw,26rem)]")}
    >
      {open && (
        <div className="fade-in space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 break-words text-base font-semibold">{title}</h2>
            <IconButton label="Fechar" type="button" onClick={onClose} className="-mr-1 -mt-1 shrink-0"><X className="size-4" /></IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
