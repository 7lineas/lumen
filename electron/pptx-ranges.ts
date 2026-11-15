export interface SlideRange {
  first: number;
  last: number;
}

const MIN_SLIDES_PER_WORKER = 4;

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
