import { useEffect, useState } from "react";
import { formatClock, secondsSince, secondsUntil } from "@shared/clock";

/** Current time, refreshed every `intervalMs`. Only the component that asks re-renders. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Time left until `endsAt` (epoch ms), shown as m:ss. */
export function CountdownClock({ endsAt, className }: { endsAt: number; className?: string }) {
  const now = useNow(250);
  return <span className={className}>{formatClock(secondsUntil(endsAt, now))}</span>;
}

/** Time since `since` (epoch ms), shown as m:ss. */
export function ElapsedClock({ since, className, title }: { since: number; className?: string; title?: string }) {
  const now = useNow(1000);
  return <span className={className} title={title}>{formatClock(secondsSince(since, now))}</span>;
}
