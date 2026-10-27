"use client";
import { useState } from "react";
import { Button, Field, Input, Modal } from "./ui";
import { SUBJECT_COLORS, createSubject, updateSubject } from "@/lib/repo";
import { cn } from "@/lib/cn";
import type { Subject } from "@/lib/schemas";

type Props = { open: boolean; subject: Subject | null; onClose: () => void; onSaved: (s: Subject) => void };

export function SubjectDialog({ open, subject, onClose, onSaved }: Props) {
  // key força o estado interno a reiniciar a cada abertura/troca de disciplina.
  return (
    <Modal open={open} onClose={onClose} title={subject ? "Editar disciplina" : "Nova disciplina"}>
      <SubjectForm key={subject?.id ?? "new"} subject={subject} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function SubjectForm({ subject, onClose, onSaved }: Omit<Props, "open">) {
  const [name, setName] = useState(subject?.name ?? "");
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = subject ? await updateSubject(subject.id, { name, color }) : await createSubject({ name, color });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.name === "ZodError" ? "Informe um nome válido (1 a 80 caracteres)." : "Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nome" error={error}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Cálculo I" maxLength={80} />
      </Field>
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-muted">Cor</legend>
        <div className="flex gap-2">
          {SUBJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn("size-7 rounded-full border-2 transition", color === c ? "border-fg" : "border-transparent")}
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </div>
    </form>
  );
}
