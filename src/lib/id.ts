let counter = 0;

/** Short unique id; good enough for local-first records. */
export function uid(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
