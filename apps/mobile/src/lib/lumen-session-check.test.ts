import { afterEach, describe, expect, it, vi } from "vitest";
import { LumenApiError, checkLumenSession } from "./lumen-client";

const SESSION = { origin: "http://100.101.102.103:43124", token: "tok-ts" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkLumenSession", () => {
  it("sends the token to the session endpoint and resolves when accepted", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkLumenSession(SESSION)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${SESSION.origin}/api/v1/session`);
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer tok-ts",
    );
  });

  it("reports unauthorized when the host no longer knows the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
          }),
      ),
    );

    const error = await checkLumenSession(SESSION).catch((e) => e);
    expect(error).toBeInstanceOf(LumenApiError);
    expect(error.status).toBe(401);
  });

  it("lets a network failure through so the caller can try another address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      }),
    );

    await expect(checkLumenSession(SESSION)).rejects.toThrow(
      "Network request failed",
    );
  });
});
