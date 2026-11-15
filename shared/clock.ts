export function formatClock(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export function secondsUntil(endsAt: number, now: number): number {
  return Math.ceil(Math.max(0, endsAt - now) / 1000);
}

export function secondsSince(since: number, now: number): number {
  return Math.floor(Math.max(0, now - since) / 1000);
}
