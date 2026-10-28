import { Button } from "./ui";
import type { Suggestion } from "@/lib/adaptive";

/** Lista curta de sugestões contextuais; some quando não há nada relevante a sugerir. */
export function Suggestions({ items, onAct }: { items: Suggestion[]; onAct: (s: Suggestion) => void }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="sug" className="space-y-2">
      <h2 id="sug" className="text-sm font-semibold">Sugestões para agora</h2>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {items.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0">{s.text}</span>
            <Button onClick={() => onAct(s)} className="shrink-0">{s.action}</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
