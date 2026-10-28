import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AsciiOcean } from "@/lib/ascii-sharks/react";

export function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="landing-brand" aria-label="StudyFlow — início">
          <span className="landing-brand-mark">SF</span>
          <span>StudyFlow</span>
        </Link>
        <span className="landing-nav-meta">
          <span className="landing-status-dot" aria-hidden="true" />
          AMBIENTE DE ESTUDOS LOCAL
        </span>
      </header>

      <section className="landing-main" aria-labelledby="landing-title">
        <div className="landing-copy">
          <div className="landing-eyebrow">
            <span>[ 01 ]</span>
            <span className="landing-eyebrow-rule" aria-hidden="true" />
            <span>SEU ESPAÇO DE ESTUDOS</span>
          </div>

          <h1 id="landing-title" className="landing-title">
            StudyFlow<span aria-hidden="true">.</span>
          </h1>

          <p className="landing-subtitle">
            Estude com clareza.
            <br />
            Sem ruído.
          </p>

          <p className="landing-description">
            Disciplinas, tarefas, anotações e revisões.
            <br className="landing-desktop-break" /> Tudo no mesmo lugar, no seu ritmo.
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
        </div>

        <div className="landing-art" aria-label="Animação de tubarões em ASCII">
          <div className="landing-art-caption">
            <span>OCEAN ENGINE</span>
            <span>ASCII / 001</span>
          </div>
          <AsciiOcean
            className="landing-ocean-canvas"
            sharks={[
              { kind: "hammerhead", size: 1 },
              { kind: "classic", size: 0.66 },
            ]}
          />
          <div className="landing-art-baseline" aria-hidden="true">
            <span>STAY CURIOUS</span>
            <span>KEEP MOVING</span>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>FOCO NO QUE IMPORTA.</span>
        <Link href="https://github.com/stackedlol/ascii-sharks" target="_blank" rel="noreferrer" className="landing-credit">
          ASCII SHARKS BY STACKEDLOL <ArrowUpRight size={12} aria-hidden="true" />
        </Link>
      </footer>
    </main>
  );
}
