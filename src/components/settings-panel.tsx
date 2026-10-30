"use client";
import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Download, Moon, Sun, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { exportBackup, importBackup } from "@/lib/repo";
import { Button } from "./ui";
import { AiSection } from "./ai-section";
import { resetAdaptive } from "./use-adaptive";
import { DEFAULT_DENSITY, DEFAULT_THEME_MODE, themeStore, type InterfaceDensity, type ThemePreferences } from "@/lib/theme-pref";
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
  const { mode, density } = useLocalStore(themeStore);
  const update = (patch: Partial<ThemePreferences>) => {
    themeStore.set((current) => ({ ...current, ...patch }));
  };

  const modeOptions = [
    { value: "light", label: "Claro", description: "Fundo claro com texto preto", icon: Sun },
    { value: "dark", label: "Escuro", description: "Interface escura para ambientes com pouca luz", icon: Moon },
  ] as const;

  const densityOptions: { value: InterfaceDensity; label: string; description: string }[] = [
    { value: "comfortable", label: "Confortável", description: "Mais espaço entre os elementos" },
    { value: "compact", label: "Compacta", description: "Mais conteúdo na tela" },
  ];

  return (
    <section className="settings-section space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Aparência</h2>
        <p className="mt-1 text-sm text-muted">Escolha o tema e o espaçamento da interface.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Tema</h3>
        <div className="theme-mode-options" role="group" aria-label="Tema da interface">
          {modeOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                onClick={() => update({ mode: option.value })}
                className={mode === option.value ? "theme-mode-option is-selected" : "theme-mode-option"}
              >
                <span className="theme-mode-icon"><Icon size={17} aria-hidden /></span>
                <span className="theme-mode-copy">
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </span>
                {mode === option.value && <Check className="theme-mode-check" size={16} aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Espaçamento</h3>
        <div className="theme-density-options" role="group" aria-label="Densidade da interface">
          {densityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={density === option.value}
              onClick={() => update({ density: option.value })}
              className={density === option.value ? "theme-density-option is-selected" : "theme-density-option"}
            >
              <span className="theme-density-indicator" aria-hidden>
                <span /><span /><span />
              </span>
              <span className="theme-density-copy">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
              {density === option.value && <Check size={15} aria-hidden />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end border-t border-line pt-3">
        <Button
          variant="ghost"
          onClick={() => themeStore.set({ mode: DEFAULT_THEME_MODE, density: DEFAULT_DENSITY })}
        >
          Restaurar aparência padrão
        </Button>
      </div>
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
