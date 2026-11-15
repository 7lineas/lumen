export type LumenSession = {
  origin: string;
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

export async function checkLumenSession(
  session: LumenSession,
  timeoutMs = 4_000,
): Promise<void> {
  await requestJson(
    `${session.origin}/api/v1/session`,
    { method: "GET", headers: { authorization: `Bearer ${session.token}` } },
    timeoutMs,
  );
}

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
