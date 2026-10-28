import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AsciiOcean } from "@/lib/ascii-sharks/react";

export function LandingPage() {
  return (
    <main className="landing-page landing-page-full">
      <div className="landing-ocean" aria-hidden="true">
        <AsciiOcean
          className="landing-ocean-canvas"
          sharks={[
            { kind: "hammerhead", size: 2.25 },
            { kind: "mako", size: 1.45 },
            { kind: "classic", size: 1.05 },
            { kind: "thresher", size: 0.86 },
          ]}
        />
      </div>
      <div className="landing-ocean-shade" aria-hidden="true" />

      <section className="landing-copy landing-copy-overlay" aria-labelledby="landing-title">
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
      </section>

    </main>
  );
}
