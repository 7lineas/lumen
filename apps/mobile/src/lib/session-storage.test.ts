import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import {
  clearLumenSession,
  loadLumenSession,
  saveLumenSession,
} from "./session-storage";

vi.mock("expo-secure-store", () => {
  const items = new Map<string, string>();
  return {
    getItemAsync: vi.fn(async (key: string) => items.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      items.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      items.delete(key);
    }),
  };
});

const SESSION = { origin: "http://192.168.1.20:43124", token: "tok-123" };

describe("session storage", () => {
  beforeEach(async () => {
    await clearLumenSession();
  });

  it("round-trips a saved session and clears it", async () => {
    await saveLumenSession(SESSION);
    await expect(loadLumenSession()).resolves.toEqual(SESSION);

    await clearLumenSession();
    await expect(loadLumenSession()).resolves.toBeNull();
  });

  it("returns null when the stored value is not valid JSON", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("{not json");

    await expect(loadLumenSession()).resolves.toBeNull();
  });

  it("returns null when origin or token is missing", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(
      JSON.stringify({ origin: SESSION.origin }),
    );
    await expect(loadLumenSession()).resolves.toBeNull();

    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(
      JSON.stringify({ token: SESSION.token }),
    );
    await expect(loadLumenSession()).resolves.toBeNull();
  });
});
