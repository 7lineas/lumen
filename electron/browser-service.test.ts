import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  rotateBrowserPairingCode,
  startBrowserService,
  stopBrowserService,
} from "./browser-service";

const DAY_MS = 24 * 60 * 60 * 1000;

function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

async function startService(port: number, pairingCode: string): Promise<void> {
  process.env.LUMEN_BROWSER_PORT = String(port);
  startBrowserService({
    root: os.tmpdir(),
    userData: os.tmpdir(),
    host: "0.0.0.0",
    pairingCode,
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(`${baseUrl(port)}/api/v1/session`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("browser service did not start");
}

function pair(port: number, code: string): Promise<Response> {
  return fetch(`${baseUrl(port)}/api/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

function checkSession(port: number, token: string): Promise<Response> {
  return fetch(`${baseUrl(port)}/api/v1/session`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function tokenFrom(response: Response): Promise<string> {
  expect(response.status).toBe(200);
  return ((await response.json()) as { token: string }).token;
}

afterEach(() => {
  stopBrowserService();
  vi.restoreAllMocks();
});

describe("browser access pairing", () => {
  it("keeps paired sessions valid without a time limit and lets the code rotate", async () => {
    const port = 43917;
    await startService(port, "123456");
    const token = await tokenFrom(await pair(port, "123456"));

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 90 * DAY_MS);
    expect((await checkSession(port, token)).status).toBe(200);

    rotateBrowserPairingCode("654321");
    expect((await pair(port, "123456")).status).toBe(401);
    expect((await pair(port, "654321")).status).toBe(200);
    expect((await checkSession(port, token)).status).toBe(200);
  });

  it("revokes every paired session when the service is stopped", async () => {
    const port = 43918;
    await startService(port, "123456");
    const token = await tokenFrom(await pair(port, "123456"));

    stopBrowserService();
    await startService(port, "123456");
    expect((await checkSession(port, token)).status).toBe(401);
  });
});
