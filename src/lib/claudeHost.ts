// When the web build runs as a published Claude artifact, the page can reach
// Claude features (the viewer's own Claude account, private storage) through
// `window.claude.use(name)`. Everywhere else there's no host and this returns null.

export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute(input: Record<string, unknown>, context: { signal: AbortSignal }): unknown;
}

export interface SampleOptions {
  onText?: (update: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  tools?: SampleTool[];
  modelTier?: 'default' | 'complex' | 'quick';
  cache?: boolean;
}

export type SampleFn = ((
  input: string | { role: 'user' | 'assistant'; content: string }[],
  options?: SampleOptions,
) => Promise<{ text: string; truncated: boolean }>) & {
  limits(): Promise<{ maxPromptBytes: number; tools?: { maxCount: number } }>;
};

export interface SampleError {
  code: string;
  message: string;
  text?: string;
}

interface DocSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface HostDb {
  doc(path: string): {
    get(): Promise<DocSnapshot>;
    set(data: Record<string, unknown>): Promise<void>;
    delete(): Promise<void>;
  };
}

export interface HostUser {
  id(): Promise<string | null>;
}

interface CapabilityMap {
  sample: SampleFn;
  db: HostDb;
  user: HostUser;
}

type Host = { use<K extends keyof CapabilityMap>(name: K): Promise<CapabilityMap[K] | null> };

function host(): Host | null {
  const h = (globalThis as { claude?: Partial<Host> }).claude;
  return h && typeof h.use === 'function' ? (h as Host) : null;
}

const cache = new Map<string, Promise<unknown>>();

export function useHostCapability<K extends keyof CapabilityMap>(name: K): Promise<CapabilityMap[K] | null> {
  if (!cache.has(name)) {
    const h = host();
    cache.set(name, h ? h.use(name).catch(() => null) : Promise.resolve(null));
  }
  return cache.get(name) as Promise<CapabilityMap[K] | null>;
}

export function isSampleError(e: unknown): e is SampleError {
  return typeof e === 'object' && e !== null && typeof (e as SampleError).code === 'string';
}
