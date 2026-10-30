import { fetch as expoFetch } from "expo/fetch";
import { LumenApiError, type LumenSession } from "./lumen-client";
import { parseSseFrames, type LumenEvent } from "./sse-frames";

/**
 * Streams `/api/v1/events` until the server closes it or `signal` aborts.
 * `expo/fetch` is used because React Native's global fetch does not expose a
 * readable response body. Throws on HTTP or network failure.
 */
export async function streamLumenEvents(
  session: LumenSession,
  options: {
    signal: AbortSignal;
    onOpen: () => void;
    onEvent: (event: LumenEvent) => void;
  },
): Promise<void> {
  const response = await expoFetch(`${session.origin}/api/v1/events`, {
    headers: { authorization: `Bearer ${session.token}` },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new LumenApiError(response.status, "event_stream_unavailable");
  }
  if (!response.body) {
    throw new LumenApiError(response.status, "event_stream_unavailable");
  }
  options.onOpen();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!options.signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseFrames(buffer);
    buffer = rest;
    events.forEach(options.onEvent);
  }
}
