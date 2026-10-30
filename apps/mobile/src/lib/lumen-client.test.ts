import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LumenApiError,
  createLumenClient,
  createLumenSession,
} from "./lumen-client";

const ORIGIN = "http://192.168.1.20:43124";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createLumenSession", () => {
  it("posts the pairing code and returns the session token", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ token: "tok-123" }));

    await expect(createLumenSession(ORIGIN, "123456")).resolves.toBe("tok-123");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/api/v1/session`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ code: "123456" });
  });

  it("throws invalid_session_response when the token is missing", async () => {
    stubFetch(async () => jsonResponse({ ok: true }));

    const error = await createLumenSession(ORIGIN, "123456").catch((e) => e);
    expect(error).toBeInstanceOf(LumenApiError);
    expect(error.code).toBe("invalid_session_response");
    expect(error.status).toBe(502);
  });

  it("throws the server error code and status on a non-OK response", async () => {
    stubFetch(async () => jsonResponse({ error: "too_many_attempts" }, 429));

    const error = await createLumenSession(ORIGIN, "000000").catch((e) => e);
    expect(error).toBeInstanceOf(LumenApiError);
    expect(error.code).toBe("too_many_attempts");
    expect(error.status).toBe(429);
  });
});

describe("createLumenClient().rpc", () => {
  const session = { origin: ORIGIN, token: "tok-123" };

  it("sends the bearer token and channel args, and returns result", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({ result: { ok: true } }),
    );

    const result = await createLumenClient(session).rpc("projector:state", [
      1,
      "a",
    ]);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/api/v1/rpc`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer tok-123",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      channel: "projector:state",
      args: [1, "a"],
    });
  });

  it("calls onUnauthorized on 401 and rethrows the error", async () => {
    stubFetch(async () => jsonResponse({ error: "unauthorized" }, 401));
    const onUnauthorized = vi.fn();

    const call = createLumenClient(session, onUnauthorized).rpc("settings:get");

    await expect(call).rejects.toBeInstanceOf(LumenApiError);
    await expect(call).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not call onUnauthorized for other API errors", async () => {
    stubFetch(async () =>
      jsonResponse({ error: "unsupported_operation" }, 400),
    );
    const onUnauthorized = vi.fn();

    await expect(
      createLumenClient(session, onUnauthorized).rpc("nope"),
    ).rejects.toMatchObject({ code: "unsupported_operation", status: 400 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("propagates a network rejection without calling onUnauthorized", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const onUnauthorized = vi.fn();

    await expect(
      createLumenClient(session, onUnauthorized).rpc("projector:state"),
    ).rejects.toThrow("fetch failed");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
