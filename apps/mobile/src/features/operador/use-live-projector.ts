import { useEffect, useState } from "react";
import type { ProjectorPayload } from "@shared/types";
import { streamLumenEvents } from "@/lib/lumen-events";
import { LumenApiError } from "@/lib/lumen-client";
import { useLumenSession } from "@/providers/session-provider";

const RETRY_MS = 2000;

/** What the projector shows now, kept current by Lumen's event stream. */
export function useLiveProjector(): {
  payload: ProjectorPayload | null;
  connected: boolean;
} {
  const { session, forget } = useLumenSession();
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
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof LumenApiError && error.status === 401) {
          void forget();
          return;
        }
      }
      if (controller.signal.aborted) return;
      // The stream ended or failed: the host may be asleep or on another network.
      setConnected(false);
      retry = setTimeout(() => void connect(), RETRY_MS);
    };

    void connect();
    return () => {
      controller.abort();
      clearTimeout(retry);
      setConnected(false);
    };
  }, [session, forget]);

  return { payload, connected };
}
