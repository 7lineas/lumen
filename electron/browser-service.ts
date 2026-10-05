import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Browser transport for the Electron-owned application service. It deliberately
 * exposes a small capability allow-list; native dialogs, updater controls,
 * display enumeration and arbitrary file operations stay inside Electron.
 */
export type RpcHandler = (args: unknown[]) => Promise<unknown> | unknown;

const BROWSER_CHANNELS = new Set([
  "bibles:list", "bibles:load", "yvp:versions", "yvp:chapter", "bibles:catalog",
  "bibles:download", "bibles:remove", "settings:get", "settings:set", "history:get", "history:add",
  "queue:get", "queue:set", "favorites:get", "favorites:set", "songs:get", "songs:set",
  "slides:get", "slides:set", "slides:readFile", "slides:savePngs", "slides:convertPptx",
  "projector:show", "background:delete",
]);

const EVENT_NAMES = new Set([
  "projector:update", "settings:update", "bibles:download-progress", "slides:progress",
]);
const API_PREFIX = "/api/v1";

type EventMessage = { event: string; payload: unknown };
const subscribers = new Set<ServerResponse>();
const latestEvents = new Map<string, unknown>();
const rpcHandlers = new Map<string, RpcHandler>();
let server: ReturnType<typeof createServer> | null = null;
let pairingCode = "";
const sessionTokens = new Map<string, number>();
const pairingFailures = new Map<string, { count: number; retryAt: number }>();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 128;

export function registerBrowserRpc(channel: string, handler: RpcHandler): void {
  rpcHandlers.set(channel, handler);
}

export function publishBrowserEvent(event: string, payload: unknown): void {
  if (!EVENT_NAMES.has(event)) return;
  latestEvents.set(event, payload);
  const data = `data: ${JSON.stringify({ event, payload } satisfies EventMessage)}\n\n`;
  for (const response of subscribers) {
    try { response.write(data); } catch { subscribers.delete(response); }
  }
}

function authorized(request: IncomingMessage, lan: boolean): boolean {
  if (!lan) return true;
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const mediaCookie = request.headers.cookie?.split(";").map((entry) => entry.trim())
    .find((entry) => entry.startsWith("lumen_media_session="))?.slice("lumen_media_session=".length);
  const supplied = bearer || (request.url?.startsWith("/media/") ? mediaCookie : undefined) || "";
  const expiresAt = sessionTokens.get(supplied);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessionTokens.delete(supplied);
    return false;
  }
  return true;
}

async function readJson(request: IncomingMessage, maxBytes = 4096): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > maxBytes) return null;
  }
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function setMediaSessionCookie(response: ServerResponse, token: string): void {
  response.setHeader("set-cookie", `lumen_media_session=${token}; HttpOnly; SameSite=Strict; Path=/media; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
}

function contentType(file: string): string {
  return ({
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".avif": "image/avif", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm",
    ".ogg": "video/ogg", ".mov": "video/quicktime", ".woff2": "font/woff2", ".ico": "image/x-icon",
  } as Record<string, string>)[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Start only when explicitly enabled. LAN sessions must first exchange the pairing PIN. */
export function startBrowserService(options: { root: string; userData: string; host: string; pairingCode?: string }): void {
  if (server) return;
  const host = options.host;
  const lan = host !== "127.0.0.1" && host !== "localhost";
  pairingCode = options.pairingCode ?? "";
  if (lan && !/^\d{6}$/.test(pairingCode)) {
    console.error("[browser] LAN binding refused: a six-digit pairing code is required.");
    return;
  }
  const port = Number(process.env.LUMEN_BROWSER_PORT ?? 43124);
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const protectedRoute = url.pathname.startsWith(`${API_PREFIX}/`) || url.pathname.startsWith("/media/");
    if (request.method === "POST" && url.pathname === `${API_PREFIX}/session`) {
      if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
        return send(response, 415, { error: "application_json_required" });
      }
      const origin = request.headers.origin;
      if (origin) {
        try {
          if (new URL(origin).host !== request.headers.host) return send(response, 403, { error: "origin_not_allowed" });
        } catch { return send(response, 403, { error: "origin_not_allowed" }); }
      }
      const sourceIp = request.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const failures = pairingFailures.get(sourceIp);
      if (failures && failures.retryAt > now) return send(response, 429, { error: "too_many_attempts", retryAfterMs: failures.retryAt - now });
      const data = await readJson(request);
      const candidate = typeof data?.code === "string" ? data.code : "";
      const expected = Buffer.from(pairingCode);
      const actual = Buffer.from(candidate);
      const validPin = pairingCode.length === 6 && actual.length === expected.length && timingSafeEqual(actual, expected);
      if (!validPin) {
        const count = (failures?.count ?? 0) + 1;
        pairingFailures.set(sourceIp, { count, retryAt: count >= 5 ? now + 15 * 60 * 1000 : 0 });
        return send(response, 401, { error: "invalid_pairing_code" });
      }
      pairingFailures.delete(sourceIp);
      for (const [activeToken, expiresAt] of sessionTokens) {
        if (expiresAt <= now) sessionTokens.delete(activeToken);
      }
      if (sessionTokens.size >= MAX_ACTIVE_SESSIONS) return send(response, 429, { error: "too_many_sessions" });
      const token = randomBytes(32).toString("base64url");
      sessionTokens.set(token, now + SESSION_TTL_MS);
      setMediaSessionCookie(response, token);
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ token }));
      return;
    }
    if (protectedRoute && !authorized(request, lan)) return send(response, 401, { error: "unauthorized" });
    if (request.method === "GET" && url.pathname === `${API_PREFIX}/session`) {
      const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (bearer && sessionTokens.has(bearer)) setMediaSessionCookie(response, bearer);
      return send(response, 200, { ok: true });
    }
    if (request.method === "GET" && url.pathname === `${API_PREFIX}/events`) {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": request.headers.origin ?? "null" });
      response.write(": connected\n\n");
      subscribers.add(response);
      for (const [event, payload] of latestEvents) {
        response.write(`data: ${JSON.stringify({ event, payload } satisfies EventMessage)}\n\n`);
      }
      request.on("close", () => subscribers.delete(response));
      return;
    }
    if (request.method === "POST" && url.pathname === `${API_PREFIX}/rpc`) {
      const data = await readJson(request, 128 * 1024 * 1024);
      if (!data) return send(response, 400, { error: "invalid_request" });
      try {
        const channel = typeof data.channel === "string" ? data.channel : "";
        const handler = rpcHandlers.get(channel);
        if (!BROWSER_CHANNELS.has(channel) || !handler) return send(response, 404, { error: "unsupported_operation" });
        return send(response, 200, { result: await handler(Array.isArray(data.args) ? data.args : []) });
      } catch (error) {
        return send(response, 400, { error: error instanceof Error ? error.message : "request_failed" });
      }
    }
    if (request.method === "GET" && url.pathname.startsWith("/media/")) {
      const name = decodeURIComponent(url.pathname.slice("/media/".length));
      const base = path.resolve(options.userData);
      const candidate = path.resolve(base, name);
      const roots = ["background-images", "slide-images"].map((dir) => path.join(base, dir) + path.sep);
      if (!roots.some((root) => candidate.startsWith(root)) || !existsSync(candidate) || !statSync(candidate).isFile()) return send(response, 404, { error: "not_found" });
      const { size } = statSync(candidate);
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) {
          response.writeHead(416, { "content-range": `bytes */${size}`, "accept-ranges": "bytes" });
          return response.end();
        }
        const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
        let end = match[2] && match[1] ? Number(match[2]) : size - 1;
        if (start >= size || end < start) {
          response.writeHead(416, { "content-range": `bytes */${size}`, "accept-ranges": "bytes" });
          return response.end();
        }
        end = Math.min(end, size - 1);
        response.writeHead(206, {
          "content-type": contentType(candidate), "content-length": end - start + 1,
          "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "cache-control": "private, max-age=300",
        });
        createReadStream(candidate, { start, end }).pipe(response);
        return;
      }
      response.writeHead(200, {
        "content-type": contentType(candidate), "content-length": size, "accept-ranges": "bytes",
        "cache-control": "private, max-age=300",
      });
      createReadStream(candidate).pipe(response);
      return;
    }
    if (request.method === "GET") {
      const dist = path.resolve(options.root);
      const asset = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      const file = asset.startsWith(dist + path.sep) && existsSync(asset) && statSync(asset).isFile() ? asset : path.join(dist, "index.html");
      if (!existsSync(file)) return send(response, 404, { error: "web_build_missing" });
      response.writeHead(200, { "content-type": contentType(file), "cache-control": file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable" });
      createReadStream(file).pipe(response);
      return;
    }
    send(response, 404, { error: "not_found" });
  });
  server.on("error", (error) => {
    console.error("[browser] service failed to start", error);
    server = null;
  });
  server.listen(port, host, () => console.info(`[browser] service listening at http://${host}:${port}`));
}

export function stopBrowserService(): void {
  for (const response of subscribers) response.end();
  subscribers.clear();
  sessionTokens.clear();
  pairingFailures.clear();
  pairingCode = "";
  server?.close();
  server = null;
}
