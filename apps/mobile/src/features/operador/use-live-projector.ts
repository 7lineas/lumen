import { useEffect, useState } from "react";
import type { ProjectorPayload } from "@shared/types";
import { streamLumenEvents } from "@/lib/lumen-events";
import { useLumenSession } from "@/providers/session-provider";

const RETRY_MS = 3000;

/**
 * What the projector shows now, kept current by Lumen's event stream. When the
 * stream drops, the provider looks for an address that still answers (Wi-Fi or
 * Tailscale) before the next attempt.
 */
export function useLiveProjector(): {
  payload: ProjectorPayload | null;
  connected: boolean;
} {
  const { session, reconnect } = useLumenSession();
  const [payload, setPayload] = useState<ProjectorPayload | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = async (): Promise<void> => {
      try {
        await streamLumenEvents(session, {
          signal: controller.signal,
          onOpen: () => setConnected(true),
          onEvent: (event) => {
            if (event.event === "projector:update") {
              setPayload(event.payload as ProjectorPayload);
            }
          },
        });
      } catch {
        // Handled below: the address may be gone or the token may be dead.
      }
      if (controller.signal.aborted) return;
      setConnected(false);
      await reconnect();
      if (controller.signal.aborted) return;
      retry = setTimeout(() => void connect(), RETRY_MS);
    };

    void connect();
    return () => {
      controller.abort();
      clearTimeout(retry);
      setConnected(false);
    };
    // `session` changes identity when the provider switches address, which
    // restarts the stream on the new one.
  }, [session, reconnect]);

  return { payload, connected };
}
