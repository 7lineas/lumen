export interface SlideRange {
  first: number;
  last: number;
}

/** Below this many slides per worker, starting another process costs more than it saves. */
const MIN_SLIDES_PER_WORKER = 4;

/**
 * Split slides 1..expected into contiguous ranges, one per worker. The last
 * range runs to `maxSlides` so slides past an underestimated count still render.
 */
export function planSlideRanges(
  expected: number,
  maxSlides: number,
  workers: number,
): SlideRange[] {
  const total = Math.max(1, Math.min(expected, maxSlides));
  const count = Math.max(
    1,
    Math.min(workers, Math.floor(total / MIN_SLIDES_PER_WORKER)),
  );
  const ranges: SlideRange[] = [];
  let first = 1;
  for (let i = 0; i < count; i++) {
    const size = Math.ceil((total - first + 1) / (count - i));
    const last = i === count - 1 ? maxSlides : first + size - 1;
    ranges.push({ first, last });
    first += size;
  }
  return ranges;
}
