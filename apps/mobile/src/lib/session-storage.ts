import * as SecureStore from "expo-secure-store";
import type { LumenSession } from "./lumen-client";

const SESSION_KEY = "lumen-host-session";

/**
 * The session token lives only in the Keychain / Keystore. It is never written
 * to AsyncStorage, which is plain text on disk.
 */
export async function loadLumenSession(): Promise<LumenSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<LumenSession>;
    if (typeof stored.origin === "string" && typeof stored.token === "string") {
      return { origin: stored.origin, token: stored.token };
    }
  } catch {
    // Unreadable entry: treat as unpaired so the volunteer pairs again.
  }
  return null;
}

export async function saveLumenSession(session: LumenSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearLumenSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
