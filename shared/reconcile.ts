export function reconcileById<T extends { id: string }>(
  current: readonly T[],
  saved: unknown,
): T[] {
  const next = Array.isArray(saved) ? (saved as T[]) : [];
  const byId = new Map(current.map((item) => [item.id, item]));
  let changed = next.length !== current.length;
  const merged = next.map((item, index) => {
    const existing = byId.get(item.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(item)) {
      if (current[index] !== existing) changed = true;
      return existing;
    }
    changed = true;
    return item;
  });
  return changed ? merged : (current as T[]);
}
