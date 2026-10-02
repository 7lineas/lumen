/**
 * Builds a public download URL from the single DOWNLOAD_BASE_URL.
 * The filename must be one safe path segment so a remote manifest cannot
 * redirect the link off the bucket.
 */
export function safeObjectKey(filename) {
  const name = String(filename ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return "";
  if (name.includes("..")) return "";
  return name;
}

export function joinDownloadUrl(base, filename) {
  const root = String(base ?? "").trim().replace(/\/+$/, "");
  const key = safeObjectKey(filename);
  if (!root || !key) return "";
  return `${root}/${key}`;
}
