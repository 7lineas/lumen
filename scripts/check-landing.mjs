import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "landing-dist");
const base = "https://downloads.7lineas.com";
const port = 44741;

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, "scripts", "prepare-landing.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DOWNLOAD_BASE_URL: base },
  });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`prepare ${code}`))));
});

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const rel = decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(outDir, rel === "/" ? "index.html" : rel));
  if (!filePath.startsWith(outDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("no");
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const chrome = process.env.CHROME || "/usr/local/bin/google-chrome";
const pageUrl = `http://127.0.0.1:${port}/`;
const child = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--user-data-dir=/tmp/lumen-landing-chrome",
    "--remote-debugging-port=9333",
    pageUrl,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

let stderr = "";
const devtoolsUrl = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Chrome no abrió DevTools\n${stderr.slice(-500)}`)), 15000);
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) {
      clearTimeout(timer);
      resolve(match[1]);
    }
  });
});

const browserWs = await devtoolsUrl;
const debugPort = new URL(browserWs).port;
const started = Date.now();
let page = null;
while (Date.now() - started < 15000) {
  const list = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  page = list.find((target) => target.type === "page" && target.url.startsWith(pageUrl));
  if (page) break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!page) throw new Error("Chrome no abrió la landing");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", reject);
});

let nextId = 0;
const pending = new Map();
const logs = [];
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    logs.push(message.params.exceptionDetails?.exception?.description || "exception");
  }
  if (message.method === "Runtime.consoleAPICalled") {
    logs.push(message.params.args?.map((arg) => arg.value).join(" "));
  }
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP ${method} no respondió`)), 8000);
    pending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Runtime.enable");
let snapshot = null;
for (let attempt = 0; attempt < 25; attempt += 1) {
  const evaluated = await send("Runtime.evaluate", {
    expression: `(() => ({ ready: document.documentElement.dataset.ready || "", setup: document.getElementById("download-setup")?.href || "", portable: document.getElementById("download-portable")?.href || "", text: document.body.innerText }))()`,
    returnByValue: true,
  });
  snapshot = evaluated?.result?.value;
  if (snapshot?.ready === "1" || snapshot?.ready === "error") break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}

ws.close();
child.kill("SIGKILL");
server.close();

if (!snapshot || snapshot.ready !== "1") {
  throw new Error(`La página no quedó lista (${snapshot?.ready || "vacío"}). ${logs.join(" | ")}`);
}

const release = JSON.parse(await readFile(path.join(root, "landing", "releases.json"), "utf8"));
const setupFile = release.files.find((file) => file.id === "setup");
const portableFile = release.files.find((file) => file.id === "portable");
const setupHref = `${base}/${setupFile.filename}`;
const portableHref = `${base}/${portableFile.filename}`;
if (snapshot.setup !== setupHref) {
  throw new Error(`Enlace del instalador: ${snapshot.setup || "(vacío)"}`);
}
if (snapshot.portable !== portableHref) {
  throw new Error(`Enlace portable: ${snapshot.portable || "(vacío)"}`);
}
if (!snapshot.text.includes("Reina-Valera 1909")) throw new Error("Faltan los créditos de RV1909");
if (!snapshot.text.includes("sin modificar")) throw new Error("Falta la nota de distribución gratuita");
if (!snapshot.text.includes(setupFile.sha256)) {
  throw new Error("Falta el SHA-256 del instalador");
}
console.log("Landing OK");
console.log(setupHref);
console.log(portableHref);
