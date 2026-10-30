import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import {
  clearLumenSessions,
  loadLumenSessions,
  saveLumenSessions,
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

const LAN = { origin: "http://192.168.1.20:43124", token: "tok-lan" };
const TAILNET = { origin: "http://100.101.102.103:43124", token: "tok-ts" };

describe("session storage", () => {
  beforeEach(async () => {
    await clearLumenSessions();
  });

  it("keeps the order of paired addresses and clears them", async () => {
    await saveLumenSessions([TAILNET, LAN]);
    await expect(loadLumenSessions()).resolves.toEqual([TAILNET, LAN]);

    await clearLumenSessions();
    await expect(loadLumenSessions()).resolves.toEqual([]);
  });

  it("returns nothing when the stored value is not valid JSON", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("{not json");

    await expect(loadLumenSessions()).resolves.toEqual([]);
  });

  it("drops entries missing origin or token", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(
      JSON.stringify([{ origin: LAN.origin }, LAN, { token: "x" }]),
    );

    await expect(loadLumenSessions()).resolves.toEqual([LAN]);
  });

  it("migrates the single session saved by the first build", async () => {
    // First read is the current key (empty), second is the legacy key.
    vi.mocked(SecureStore.getItemAsync)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(LAN));

    await expect(loadLumenSessions()).resolves.toEqual([LAN]);
  });
});
