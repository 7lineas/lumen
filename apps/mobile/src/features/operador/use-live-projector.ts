import { useEffect, useState } from "react";
import type { ProjectorPayload } from "@shared/types";
import { streamLumenEvents } from "@/lib/lumen-events";
import { useLumenSession } from "@/providers/session-provider";

const RETRY_MS = 3000;

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
      } catch {}
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
  }, [session, reconnect]);

  return { payload, connected };
}
