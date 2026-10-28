"use client";
import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Field, Input, Modal } from "./ui";
import { db } from "@/lib/db";
import { leastUsedColor, readableOn } from "@/lib/adaptive";
import { SUBJECT_COLORS, createSubject, updateSubject } from "@/lib/repo";
import { cn } from "@/lib/cn";
import type { Subject } from "@/lib/schemas";

type Props = { open: boolean; subject: Subject | null; onClose: () => void; onSaved: (s: Subject) => void };
type IconMode = "letter" | "emoji" | "image";
const SUBJECT_EMOJIS = ["📘", "📐", "🧪", "💻", "🌍", "📚", "⚙️", "🧠", "🎨", "📊", "🧬", "🔬", "⚖️", "🏛️", "🗣️", "✍️"];

export function SubjectDialog({ open, subject, onClose, onSaved }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={subject ? "Editar disciplina" : "Nova disciplina"}>
      <SubjectForm key={subject?.id ?? "new"} subject={subject} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function SubjectForm({ subject, onClose, onSaved }: Omit<Props, "open">) {
  const [name, setName] = useState(subject?.name ?? "");
  const suggested = useLiveQuery(() => db.subjects.toArray().then((a) => leastUsedColor(SUBJECT_COLORS, a.map((x) => x.color))), []);
  const [picked, setPicked] = useState<string | null>(subject?.color ?? null);
  const color = picked ?? suggested ?? SUBJECT_COLORS[0];
  const [icon, setIcon] = useState<string | null>(subject?.icon ?? null);
  const [iconMode, setIconMode] = useState<IconMode>(() => subject?.icon?.startsWith("data:image/") ? "image" : subject?.icon ? "emoji" : "letter");
  const [error, setError] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function chooseMode(mode: IconMode) {
    setIconMode(mode);
    setIconError(null);
    if (mode === "letter") setIcon(null);
    if (mode === "emoji" && (!icon || icon.startsWith("data:image/"))) setIcon(SUBJECT_EMOJIS[0]);
    if (mode === "image" && !icon?.startsWith("data:image/")) setIcon(null);
  }

  function readImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setIconError("Use uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (file.size > 220 * 1024) {
      setIconError("A imagem precisa ter até 220 KB para manter o backup leve.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setIcon(reader.result);
        setIconMode("image");
        setIconError(null);
      } else setIconError("Não foi possível abrir essa imagem.");
    };
    reader.onerror = () => setIconError("Não foi possível abrir essa imagem.");
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = subject
        ? await updateSubject(subject.id, { name, color, icon })
        : await createSubject({ name, color, icon });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.name === "ZodError" ? "Confira o nome e a imagem escolhida." : "Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const mark = iconMode === "image" && icon?.startsWith("data:image/")
    ? <img src={icon} alt="" className="size-full object-cover" />
    : iconMode === "emoji" ? (icon && !icon.startsWith("data:image/") ? icon : SUBJECT_EMOJIS[0])
    : (name.trim().slice(0, 1).toLocaleUpperCase("pt-BR") || "?");

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md text-lg font-semibold" style={{ background: color, color: readableOn(color) }}>{mark}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{name.trim() || "Nome da disciplina"}</p>
          <p className="text-xs text-muted">Prévia na barra lateral</p>
        </div>
      </div>

      <Field label="Nome" error={error}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Física I" maxLength={80} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Identificação</legend>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["letter", "Letra"],
            ["emoji", "Ícone"],
            ["image", "Imagem"],
          ] as [IconMode, string][]).map(([mode, label]) => (
            <button key={mode} type="button" aria-pressed={iconMode === mode} onClick={() => chooseMode(mode)}
              className={cn("rounded-lg border px-3 py-2 text-sm transition-colors", iconMode === mode ? "border-accent bg-accent/10 text-fg" : "border-line bg-surface hover:bg-surface-2 text-muted")}>
              {label}
            </button>
          ))}
        </div>
        {iconMode === "emoji" && (
          <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
            {SUBJECT_EMOJIS.map((emoji) => (
              <button key={emoji} type="button" aria-label={`Ícone ${emoji}`} aria-pressed={icon === emoji} onClick={() => setIcon(emoji)}
                className={cn("flex size-9 items-center justify-center rounded-md border text-lg transition-colors", icon === emoji ? "border-accent bg-accent/10" : "border-line hover:bg-surface-2")}>{emoji}</button>
            ))}
          </div>
        )}
        {iconMode === "image" && (
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={readImage} className="hidden" aria-label="Escolher imagem da disciplina" />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="subtle" onClick={() => fileRef.current?.click()}>Escolher imagem</Button>
              {icon?.startsWith("data:image/") && <Button type="button" variant="ghost" onClick={() => { setIcon(null); setIconError(null); }}>Remover imagem</Button>}
            </div>
            <p className="text-xs text-muted">PNG, JPG ou WebP, até 220 KB. A imagem fica armazenada somente neste dispositivo e entra no backup.</p>
            {iconError && <p role="alert" className="text-xs text-danger">{iconError}</p>}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Cor da disciplina</legend>
        <div className="grid grid-cols-8 gap-2 sm:grid-cols-11">
          {SUBJECT_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Cor ${c}`} title={c} aria-pressed={color === c} onClick={() => setPicked(c)}
              className={cn("size-7 rounded-md border-2 transition-transform hover:scale-105", color === c ? "border-fg ring-2 ring-accent/40 ring-offset-2 ring-offset-surface" : "border-transparent")}
              style={{ background: c }} />
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? "Salvando…" : "Salvar disciplina"}</Button>
      </div>
    </form>
  );
}
