/**
 * Applies a list re-read from the host onto the list already on screen.
 *
 * Items whose content did not change keep their current object, and when
 * nothing changed the current array itself is returned. That way a sync caused
 * by another operator saving one song does not reset an open editor for a
 * different song (editors reset their draft when their item object changes),
 * and an unchanged list does not trigger a re-render or a save back to disk.
 */
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
