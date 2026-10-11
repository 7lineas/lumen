/**
 * Largest size on the `start, start-2, …` grid that `fits`, stopping at the
 * first step at or below `floor` (taken without measuring). Same result as
 * walking down 2px at a time, with O(log n) measurements; assumes a smaller
 * size never overflows when a larger one fits.
 */
export function fitFontSize(
  start: number,
  fits: (size: number) => boolean,
  floor = 28,
  maxSteps = 500,
): number {
  if (start <= floor || fits(start)) return start;
  let lo = 1;
  let hi = Math.min(Math.ceil((start - floor) / 2), maxSteps);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fits(start - 2 * mid)) hi = mid;
    else lo = mid + 1;
  }
  return start - 2 * lo;
}
