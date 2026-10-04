import { useEffect, useState } from "react";
import type { BibleData, BibleVersionMeta } from "@shared/types";
import { loadBible, setManifest, getVersions, getBible } from "@shared/bible-service";
import { emptyOnlineBible, isOnlineVersionId } from "@shared/youversion";

export function useBibleLoader(versionIds: string[], refreshKey = 0, onlineVersions: BibleVersionMeta[] = []) {
  const [ready, setReady] = useState(false);
  const [versions, setVersions] = useState<BibleVersionMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const api = window.proyector;
        if (!api) {
          setError("API de Electron no disponible");
          return;
        }
        const manifest = (await api.listBibleVersions()) as BibleVersionMeta[];
        if (cancelled) return;
        setManifest(manifest);
        setVersions(manifest);

        const unique = [...new Set(versionIds.filter(Boolean))];
        for (const id of unique) {
          if (isOnlineVersionId(id)) {
            // Online Bibles start empty; chapters are merged in on demand.
            const meta = onlineVersions.find((v) => v.id === id);
            if (meta && !getBible(id)) loadBible(emptyOnlineBible(meta));
            continue;
          }
          const data = (await api.loadBible(id)) as BibleData;
          loadBible(data);
        }
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar biblias");
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // refreshKey reloads the list after a download or removal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, versionIds.join(","), onlineVersions]);

  return { ready, versions: versions.length ? versions : getVersions(), error };
}
