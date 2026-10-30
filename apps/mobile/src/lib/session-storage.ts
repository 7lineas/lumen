import * as SecureStore from "expo-secure-store";
import type { LumenSession } from "./lumen-client";

const SESSIONS_KEY = "lumen-host-sessions";
const LEGACY_SESSION_KEY = "lumen-host-session";

function parseSession(value: unknown): LumenSession | null {
  const stored = value as Partial<LumenSession> | null;
  if (typeof stored?.origin === "string" && typeof stored.token === "string") {
    return { origin: stored.origin, token: stored.token };
  }
  return null;
}

/**
 * One session per address Lumen was paired on (local network, Tailscale), in
 * the order they should be tried. The first entry is the active one. Tokens
 * live only in the Keychain / Keystore, never in AsyncStorage, which is plain
 * text on disk.
 */
export async function loadLumenSessions(): Promise<LumenSession[]> {
  const raw = await SecureStore.getItemAsync(SESSIONS_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map(parseSession)
          .filter((s): s is LumenSession => s !== null);
      }
    } catch {
      // Unreadable entry: treat as unpaired so the volunteer pairs again.
    }
    return [];
  }

  // Earlier builds stored a single session under another key. Carry it over.
  const legacy = await SecureStore.getItemAsync(LEGACY_SESSION_KEY);
  if (!legacy) return [];
  try {
    const session = parseSession(JSON.parse(legacy));
    return session ? [session] : [];
  } catch {
    return [];
  }
}

export async function saveLumenSessions(
  sessions: LumenSession[],
): Promise<void> {
  await SecureStore.setItemAsync(SESSIONS_KEY, JSON.stringify(sessions));
  await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
}

export async function clearLumenSessions(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSIONS_KEY);
  await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
}
