"use client";
import { useRef, useState, type CSSProperties } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Download, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { exportBackup, importBackup } from "@/lib/repo";
import { Button } from "./ui";
import { AiSection } from "./ai-section";
import { resetAdaptive } from "./use-adaptive";
import { ACCENT_OPTIONS, themeStore } from "@/lib/theme-pref";
import { useLocalStore } from "./use-local-store";

export function SettingsPanel() {
  return (
    <div className="settings-page fade-in w-full max-w-3xl space-y-9">
      <AppearanceSection />
      <PersonalizationSection />
      <BackupSection />
      <AiSection />
    </div>
  );
}

function AppearanceSection() {
  const { accent } = useLocalStore(themeStore);
  return (
    <section className="settings-section space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Aparência</h2>
        <p className="mt-1 text-sm text-muted">Escolha a cor de destaque da interface. Dentro de uma disciplina, a cor dela continua sendo usada.</p>
      </div>
      <div className="accent-picker">
        {ACCENT_OPTIONS.map((option) => (
          <button
            key={option.color}
            type="button"
            aria-label={`Usar cor ${option.label}`}
            aria-pressed={accent === option.color}
            title={option.label}
            onClick={() => themeStore.set({ accent: option.color })}
            className={`accent-swatch ${accent === option.color ? "is-selected" : ""}`}
            style={{ "--swatch": option.color } as CSSProperties}
          >
            {accent === option.color && <Check size={15} aria-hidden />}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Cor atual: {ACCENT_OPTIONS.find((x) => x.color === accent)?.label ?? "Personalizada"}</p>
    </section>
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

function PersonalizationSection() {
  const [done, setDone] = useState(false);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Personalização</h2>
      <p className="text-sm text-muted">
        O StudyFlow reordena painéis e sugere próximos passos conforme o que você usa. Esse histórico de uso fica só neste dispositivo, não entra no backup e não é enviado a lugar nenhum.
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={() => { resetAdaptive(); setDone(true); }}>Redefinir personalização</Button>
        {done && <span role="status" className="text-sm text-success">Histórico de uso apagado.</span>}
      </div>
    </section>
  );
}
