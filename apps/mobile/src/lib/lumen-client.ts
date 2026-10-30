/**
 * Client for Lumen's `/api/v1` boundary (see docs/BROWSER-ACCESS.md in the
 * desktop repository). Plain fetch only: this module must stay free of native
 * imports so its contract can be tested in Node.
 */

export type LumenSession = {
  /** Service origin, e.g. http://192.168.1.20:43124 */
  origin: string;
  /** Random session token returned by the pairing exchange. */
  token: string;
};

export class LumenApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "LumenApiError";
  }
}

export type LumenClient = {
  rpc<T = unknown>(channel: string, args?: unknown[]): Promise<T>;
};

const PAIRING_TIMEOUT_MS = 10_000;
const RPC_TIMEOUT_MS = 30_000;

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ result?: unknown; token?: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      result?: unknown;
      token?: unknown;
    } | null;
    if (!response.ok) {
      throw new LumenApiError(response.status, data?.error ?? "request_failed");
    }
    return data ?? {};
  } finally {
    clearTimeout(timer);
  }
}

/** Exchanges the six-digit code shown in Lumen for a session token. */
export async function createLumenSession(
  origin: string,
  code: string,
): Promise<string> {
  const data = await requestJson(
    `${origin}/api/v1/session`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    },
    PAIRING_TIMEOUT_MS,
  );
  if (typeof data.token !== "string") {
    throw new LumenApiError(502, "invalid_session_response");
  }
  return data.token;
}

/**
 * RPC client bound to one session. A 401 means the host restarted or turned
 * access off, so the session is dead: `onUnauthorized` lets the app forget it.
 */
export function createLumenClient(
  session: LumenSession,
  onUnauthorized?: () => void,
): LumenClient {
  return {
    async rpc<T>(channel: string, args: unknown[] = []): Promise<T> {
      try {
        const data = await requestJson(
          `${session.origin}/api/v1/rpc`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${session.token}`,
            },
            body: JSON.stringify({ channel, args }),
          },
          RPC_TIMEOUT_MS,
        );
        return data.result as T;
      } catch (error) {
        if (error instanceof LumenApiError && error.status === 401) {
          onUnauthorized?.();
        }
        throw error;
      }
    },
  };
}
