import { useEffect, useState } from "react";
import { formatClock, secondsSince, secondsUntil } from "@shared/clock";

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function CountdownClock({
  endsAt,
  className,
}: {
  endsAt: number;
  className?: string;
}) {
  const now = useNow(250);
  return (
    <span className={className}>{formatClock(secondsUntil(endsAt, now))}</span>
  );
}

export function ElapsedClock({
  since,
  className,
  title,
}: {
  since: number;
  className?: string;
  title?: string;
}) {
  const now = useNow(1000);
  return (
    <span className={className} title={title}>
      {formatClock(secondsSince(since, now))}
    </span>
  );
}
