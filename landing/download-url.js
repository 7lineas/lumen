export function safeObjectKey(filename) {
  const name = String(filename ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return "";
  if (name.includes("..")) return "";
  return name;
}

export function joinDownloadUrl(base, filename) {
  const root = String(base ?? "")
    .trim()
    .replace(/\/+$/, "");
  const key = safeObjectKey(filename);
  if (!root || !key) return "";
  return `${root}/${key}`;
}
