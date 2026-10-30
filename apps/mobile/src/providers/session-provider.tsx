import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  clearLumenSession,
  loadLumenSession,
  saveLumenSession,
} from "@/lib/session-storage";
import {
  createLumenClient,
  createLumenSession,
  type LumenClient,
  type LumenSession,
} from "@/lib/lumen-client";

type SessionStatus = "loading" | "paired" | "unpaired";

type SessionValue = {
  status: SessionStatus;
  session: LumenSession | null;
  client: LumenClient | null;
  /** Exchanges the six-digit code for a token and remembers the host. */
  pair: (origin: string, code: string) => Promise<void>;
  /** Drops the host and token, e.g. on sign-out or after a 401. */
  forget: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [session, setSession] = useState<LumenSession | null>(null);

  useEffect(() => {
    let active = true;
    loadLumenSession()
      .catch(() => null)
      .then((stored) => {
        if (!active) return;
        setSession(stored);
        setStatus(stored ? "paired" : "unpaired");
      });
    return () => {
      active = false;
    };
  }, []);

  const forget = useCallback(async () => {
    setSession(null);
    setStatus("unpaired");
    await clearLumenSession().catch(() => undefined);
  }, []);

  const pair = useCallback(async (origin: string, code: string) => {
    const token = await createLumenSession(origin, code);
    const next = { origin, token };
    await saveLumenSession(next);
    setSession(next);
    setStatus("paired");
  }, []);

  const client = useMemo(
    () =>
      session ? createLumenClient(session, () => void forget()) : null,
    [session, forget],
  );

  const value = useMemo<SessionValue>(
    () => ({ status, session, client, pair, forget }),
    [status, session, client, pair, forget],
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
