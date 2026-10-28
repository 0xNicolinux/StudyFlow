import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AsciiOcean } from "@/lib/ascii-sharks/react";

export function LandingPage() {
  return (
    <main className="landing-page landing-page-full">
      <div className="landing-ocean" aria-hidden="true">
        <AsciiOcean
          className="landing-ocean-canvas"
          sharks={[
            { kind: "hammerhead", size: 1.75 },
            { kind: "mako", size: 1.2 },
            { kind: "classic", size: 0.95 },
            { kind: "thresher", size: 0.78 },
          ]}
        />
      </div>
      <div className="landing-ocean-shade" aria-hidden="true" />

      <header className="landing-nav landing-nav-overlay">
        <Link href="/" className="landing-brand" aria-label="StudyFlow — início">
          <span className="landing-brand-mark">SF</span>
          <span>StudyFlow</span>
        </Link>
        <span className="landing-nav-meta">
          <span className="landing-status-dot" aria-hidden="true" />
          SEU AMBIENTE. SEU RITMO.
        </span>
      </header>

      <section className="landing-copy landing-copy-overlay" aria-labelledby="landing-title">
        <div className="landing-eyebrow">
          <span>STUDY SYSTEM</span>
          <span className="landing-eyebrow-rule" aria-hidden="true" />
          <span>001 / FOCUS</span>
        </div>

        <h1 id="landing-title" className="landing-title">
          StudyFlow<span aria-hidden="true">.</span>
        </h1>

        <p className="landing-subtitle">
          Um lugar para pensar.
          <br />
          Espaço para evoluir.
        </p>

        <Link href="/study" className="landing-enter">
          <span>Entrar no ambiente de estudos</span>
          <ArrowRight className="landing-enter-arrow" size={18} aria-hidden="true" />
        </Link>

        <div className="landing-trust">
          <span>SEM CONTA</span>
          <span aria-hidden="true">/</span>
          <span>DADOS NO SEU DISPOSITIVO</span>
        </div>
      </section>

      <div className="landing-side-note" aria-hidden="true">
        <span>ASCII OCEAN</span>
        <span className="landing-side-note-line" />
        <span>KEEP MOVING</span>
      </div>

      <footer className="landing-footer landing-footer-overlay">
        <span>FOCO NO QUE IMPORTA.</span>
        <Link href="https://github.com/stackedlol/ascii-sharks" target="_blank" rel="noreferrer" className="landing-credit">
          ASCII SHARKS BY STACKEDLOL <ArrowUpRight size={12} aria-hidden="true" />
        </Link>
      </footer>
    </main>
  );
}
