import { useEffect, useState } from "react";
import type { BibleData, BibleVersionMeta } from "@shared/types";
import { loadBible, setManifest, getVersions } from "@shared/bible-service";

export function useBibleLoader(versionIds: string[], refreshKey = 0) {
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
  }, [refreshKey, versionIds.join(",")]);

  return { ready, versions: versions.length ? versions : getVersions(), error };
}
