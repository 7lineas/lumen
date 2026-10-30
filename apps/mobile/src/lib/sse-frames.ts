export type LumenEvent = { event: string; payload: unknown };

/**
 * Splits complete `data:` frames (terminated by a blank line) from a partial
 * buffer. Comment frames such as `: connected` carry no data and are skipped.
 */
export function parseSseFrames(buffer: string): {
  events: LumenEvent[];
  rest: string;
} {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events: LumenEvent[] = [];
  for (const frame of frames) {
    const data = frame
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    if (!data) continue;
    try {
      const parsed = JSON.parse(data) as { event?: unknown; payload?: unknown };
      if (typeof parsed.event === "string") {
        events.push({ event: parsed.event, payload: parsed.payload });
      }
    } catch {
      // A malformed frame is dropped; the next projector update repairs state.
    }
  }
  return { events, rest };
}
