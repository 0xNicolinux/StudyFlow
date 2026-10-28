"use client";
import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { exportBackup, importBackup, saveProfile } from "@/lib/repo";
import { Button, Field, Input } from "./ui";
import { AiSection } from "./ai-section";

const MAX_PHOTO = 400 * 1024;

export function SettingsPanel() {
  const profile = useLiveQuery(() => db.profile.get("me").then((p) => p ?? null), []);
  return (
    <div className="fade-in max-w-xl space-y-8">
      {profile !== undefined && <ProfileForm key={profile?.name ?? "none"} initialName={profile?.name ?? ""} initialPhoto={profile?.photo ?? null} />}
      <BackupSection />
      <AiSection />
    </div>
  );
}

function ProfileForm({ initialName, initialPhoto }: { initialName: string; initialPhoto: string | null }) {
  const [name, setName] = useState(initialName);
  const [photo, setPhoto] = useState<string | null>(initialPhoto);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsg({ ok: false, text: "Escolha um arquivo de imagem." });
    if (file.size > MAX_PHOTO) return setMsg({ ok: false, text: "A imagem deve ter no máximo 400 KB." });
    const r = new FileReader();
    r.onload = () => { setPhoto(String(r.result)); setMsg(null); };
    r.onerror = () => setMsg({ ok: false, text: "Não foi possível ler a imagem." });
    r.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveProfile({ name, photo });
      setMsg({ ok: true, text: "Perfil salvo." });
    } catch {
      setMsg({ ok: false, text: "Informe um nome válido." });
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <h2 className="text-sm font-semibold">Perfil</h2>
      <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Como devemos chamar você?" /></Field>
      <Field label="Foto (opcional)"><input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-fg" /></Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary">Salvar perfil</Button>
        {photo && <Button type="button" variant="ghost" onClick={() => setPhoto(null)}>Remover foto</Button>}
        {msg && <span role="status" className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</span>}
      </div>
    </form>
  );
}

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [withFiles, setWithFiles] = useState(false);
  const docCount = useLiveQuery(() => db.documents.count(), []);

  async function doExport() {
    try {
      const blob = new Blob([JSON.stringify(await exportBackup({ includeFiles: withFiles }), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `studyflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg({ ok: true, text: withFiles || !docCount ? "Backup exportado." : "Backup exportado sem os arquivos originais da biblioteca (só o texto extraído)." });
    } catch {
      setMsg({ ok: false, text: "Falha ao exportar o backup." });
    }
  }

  async function doImport(file: File | undefined) {
    if (!file) return;
    if (!window.confirm("Importar substitui TODOS os dados atuais deste dispositivo. Continuar?")) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    try {
      const r = await importBackup(await file.text());
      setMsg(r.ok
        ? { ok: true, text: `Importado: ${r.counts.subjects} disciplinas, ${r.counts.tasks} tarefas, ${r.counts.notes} anotações, ${r.counts.flashcards} flashcards, ${r.counts.quizzes} quizzes e ${r.counts.documents} materiais.${r.documentsWithoutOriginal ? ` ${r.documentsWithoutOriginal} material(is) sem o arquivo original (restaurado só o texto extraído).` : ""}` }
        : { ok: false, text: r.error });
    } catch {
      setMsg({ ok: false, text: "Falha ao importar o arquivo." });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Backup e privacidade</h2>
      <p className="text-sm text-muted">
        Seus dados ficam somente neste navegador e <strong className="text-fg">não são sincronizados</strong> entre dispositivos. Se o armazenamento do navegador for apagado, eles serão perdidos — exporte backups com frequência.
      </p>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} />
        <span>Incluir os arquivos originais da biblioteca (PDF/TXT/MD). O backup fica bem maior. Sem isso, só o texto extraído é salvo.</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={doExport}><Download className="size-4" aria-hidden /> Exportar backup</Button>
        <Button onClick={() => fileRef.current?.click()}><Upload className="size-4" aria-hidden /> Importar backup</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => doImport(e.target.files?.[0])} aria-label="Arquivo de backup" />
      </div>
      {msg && <p role="status" className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</p>}
    </section>
  );
}
