import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function BrowserAccessGate({ children }: { children: ReactNode }) {
  const remoteBrowser = window.__LUMEN_BROWSER__ && !isLoopbackHost(window.location.hostname);
  const [qrPairCode] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get("pair") ?? "";
    if (code) {
      query.delete("pair");
      history.replaceState(null, "", `${location.pathname}${query.size ? `?${query}` : ""}${location.hash}`);
    }
    return code;
  });
  const [unlocked, setUnlocked] = useState(!remoteBrowser || !!sessionStorage.getItem("lumen-access-token"));
  const [accessCode, setAccessCode] = useState(qrPairCode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const qrPairStarted = useRef(false);

  const pair = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 429) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error === "too_many_sessions" ? "Hay demasiados dispositivos conectados. Desactiva y vuelve a activar el acceso de red para reiniciar las sesiones." : "Demasiados intentos. Espera 15 minutos antes de volver a probar.");
      }
      const result = await response.json() as { token?: string };
      if (!response.ok || !result.token) throw new Error("El código no es válido. Verifícalo e inténtalo de nuevo.");
      sessionStorage.setItem("lumen-access-token", result.token);
      setUnlocked(true);
    } catch (reason) {
      setError(reason instanceof DOMException && reason.name === "TimeoutError"
        ? "El equipo anfitrión no respondió. Comprueba la conexión y vuelve a intentarlo."
        : reason instanceof Error ? reason.message : "No se pudo conectar con el equipo anfitrión.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (remoteBrowser && qrPairCode && !qrPairStarted.current) {
      qrPairStarted.current = true;
      void pair(qrPairCode);
    }
  }, [pair, qrPairCode, remoteBrowser]);

  const connect = (event: FormEvent) => {
    event.preventDefault();
    void pair(accessCode);
  };

  if (unlocked) return children;

  return (
    <main className="browser-access-gate">
      <form className="browser-access-card" onSubmit={(event) => void connect(event)}>
        <h1>Lumen</h1>
        <p>Ingresa el código de acceso que aparece en Ajustes en el equipo anfitrión.</p>
        <label htmlFor="browser-access-code">Código de acceso</label>
        <input id="browser-access-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={accessCode} onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
        {error && <p role="alert" className="browser-access-error">{error}</p>}
        <button type="submit" disabled={busy || accessCode.trim().length !== 6}>{busy ? "Conectando…" : "Conectar"}</button>
      </form>
    </main>
  );
}
