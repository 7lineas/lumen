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
