/**
 * Pequeno repositório de preferências de interface no localStorage (somente neste dispositivo).
 * Compatível com useSyncExternalStore: `get` devolve a mesma referência enquanto o conteúdo não muda.
 * Se o navegador bloquear o armazenamento, o valor continua valendo durante a sessão (só não persiste).
 */
export type LocalStore<T> = {
  readonly initial: T;
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
};

export function createLocalStore<T>(key: string, parse: (input: unknown) => T): LocalStore<T> {
  const initial = parse(undefined);
  const listeners = new Set<() => void>();
  let rawCache: string | null | undefined;
  let value = initial;
  let memoryOnly = false;

  const get = (): T => {
    if (memoryOnly) return value;
    let raw: string | null;
    try { raw = localStorage.getItem(key); } catch { return value; }
    if (raw === rawCache) return value;
    rawCache = raw;
    try { value = raw ? parse(JSON.parse(raw)) : initial; } catch { value = initial; }
    return value;
  };

  const notify = () => listeners.forEach((l) => l());

  const set = (next: T | ((prev: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (p: T) => T)(get()) : next;
    value = resolved;
    try {
      const raw = JSON.stringify(resolved);
      localStorage.setItem(key, raw);
      rawCache = raw;
      memoryOnly = false;
    } catch { memoryOnly = true; }
    notify();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) listener(); }; // outras abas
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
  };

  return { initial, get, set, subscribe };
}
