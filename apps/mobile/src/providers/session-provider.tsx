import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  checkLumenSession,
  createLumenClient,
  createLumenSession,
  LumenApiError,
  type LumenClient,
  type LumenSession,
} from "@/lib/lumen-client";
import {
  clearLumenSessions,
  loadLumenSessions,
  saveLumenSessions,
} from "@/lib/session-storage";

type SessionStatus = "loading" | "paired" | "unpaired";

type SessionValue = {
  status: SessionStatus;
  session: LumenSession | null;
  client: LumenClient | null;
  pair: (origin: string, code: string) => Promise<void>;
  forget: () => Promise<void>;
  reconnect: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [sessions, setSessions] = useState<LumenSession[]>([]);
  const sessionsRef = useRef<LumenSession[]>([]);
  const reconnecting = useRef(false);

  const commit = useCallback(async (next: LumenSession[]) => {
    sessionsRef.current = next;
    setSessions(next);
    setStatus(next.length > 0 ? "paired" : "unpaired");
    if (next.length > 0) {
      await saveLumenSessions(next);
    } else {
      await clearLumenSessions().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadLumenSessions()
      .catch(() => [] as LumenSession[])
      .then((stored) => {
        if (!active) return;
        sessionsRef.current = stored;
        setSessions(stored);
        setStatus(stored.length > 0 ? "paired" : "unpaired");
      });
    return () => {
      active = false;
    };
  }, []);

  const forget = useCallback(() => commit([]), [commit]);

  const dropOrigin = useCallback(
    (origin: string) =>
      commit(sessionsRef.current.filter((s) => s.origin !== origin)),
    [commit],
  );

  const pair = useCallback(
    async (origin: string, code: string) => {
      const token = await createLumenSession(origin, code);
      await commit([
        { origin, token },
        ...sessionsRef.current.filter((s) => s.origin !== origin),
      ]);
    },
    [commit],
  );

  const reconnect = useCallback(async () => {
    if (reconnecting.current) return;
    const current = sessionsRef.current;
    if (current.length === 0) return;

    reconnecting.current = true;
    try {
      const results = await Promise.allSettled(
        current.map((candidate) => checkLumenSession(candidate)),
      );
      const reachable = results.findIndex((r) => r.status === "fulfilled");
      const dead = current.filter((_, index) => {
        const result = results[index];
        return (
          result.status === "rejected" &&
          result.reason instanceof LumenApiError &&
          result.reason.status === 401
        );
      });
      const alive = current.filter((s) => !dead.includes(s));
      const next =
        reachable >= 0
          ? [
              current[reachable]!,
              ...alive.filter((s) => s !== current[reachable]),
            ]
          : alive;

      const unchanged =
        next.length === current.length &&
        next.every((s, index) => s === current[index]);
      if (!unchanged) await commit(next);
    } finally {
      reconnecting.current = false;
    }
  }, [commit]);

  const session = sessions[0] ?? null;

  const client = useMemo(
    () =>
      session
        ? createLumenClient(session, () => void dropOrigin(session.origin))
        : null,
    [session, dropOrigin],
  );

  const value = useMemo<SessionValue>(
    () => ({ status, session, client, pair, forget, reconnect }),
    [status, session, client, pair, forget, reconnect],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useLumenSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useLumenSession must be used within SessionProvider");
  }
  return value;
}
