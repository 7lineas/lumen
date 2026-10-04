import { useCallback, useEffect, useRef, useState } from "react";
import type { BibleVersionMeta } from "@shared/types";
import { getBible, loadBible } from "@shared/bible-service";
import {
  emptyOnlineBible,
  hasChapter,
  isOnlineVersionId,
  mergeChapter,
  type ChapterResult,
  type OnlineVersionsResult,
} from "@shared/youversion";

export type ChapterFailure = Extract<ChapterResult, { ok: false }>;

export interface ChapterRef {
  versionId: string;
  book: string;
  chapter: number;
}

/**
 * Online Bibles (YouVersion Platform) for the operator window. The App Key and
 * all network access stay in the main process; this hook only asks for
 * chapters over IPC and merges them into the in-memory Bible cache.
 */
export function useOnlineBibles() {
  const [online, setOnline] = useState<OnlineVersionsResult>({ configured: false, versions: [], stale: false });
  /** Bumps every time a chapter is merged so memoized readers recompute. */
  const [chapterTick, setChapterTick] = useState(0);
  /** True once the first version-list request has answered (even with an error). */
  const [loaded, setLoaded] = useState(false);
  const [failures, setFailures] = useState<Record<string, ChapterFailure>>({});
  const [loading, setLoading] = useState<Record<string, true>>({});
  const requested = useRef(new Set<string>());
  const versionsRef = useRef<BibleVersionMeta[]>([]);
  versionsRef.current = online.versions;

  const refreshVersions = useCallback(async (force = false) => {
    const api = window.proyector;
    if (!api?.listOnlineBibles) return;
    try {
      setOnline(await api.listOnlineBibles(force));
    } catch {
      // Keep whatever list we already have.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshVersions();
  }, [refreshVersions]);

  const keyOf = (ref: ChapterRef) => `${ref.versionId}/${ref.book}.${ref.chapter}`;

  const ensureChapter = useCallback(async (ref: ChapterRef): Promise<ChapterResult | null> => {
    const api = window.proyector;
    if (!api?.getOnlineChapter || !isOnlineVersionId(ref.versionId)) return null;
    const key = keyOf(ref);
    if (hasChapter(getBible(ref.versionId), ref.book, ref.chapter)) return null;
    if (requested.current.has(key)) return null;
    requested.current.add(key);
    setLoading((prev) => ({ ...prev, [key]: true }));
    let result: ChapterResult;
    try {
      result = await api.getOnlineChapter(ref.versionId, ref.book, ref.chapter);
    } catch (error) {
      result = { ok: false, reason: "error", message: error instanceof Error ? error.message : "Error de YouVersion" };
    }
    setLoading((prev) => {
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
    if (result.ok) {
      let bible = getBible(ref.versionId);
      if (!bible) {
        const meta = versionsRef.current.find((v) => v.id === ref.versionId);
        if (!meta) {
          requested.current.delete(key);
          return result;
        }
        bible = emptyOnlineBible(meta);
        loadBible(bible);
      }
      // The publisher's attribution travels with every chapter and is what the
      // projector footer prints for this Bible.
      if (result.copyright) bible.meta.copyright = result.copyright;
      mergeChapter(bible, ref.book, ref.chapter, result.verses);
      setFailures((prev) => {
        if (!(key in prev)) return prev;
        const rest = { ...prev };
        delete rest[key];
        return rest;
      });
      setChapterTick((tick) => tick + 1);
    } else {
      // Stay "requested" so effects do not retry in a loop; an explicit
      // retry (resetFailures) clears it.
      setFailures((prev) => ({ ...prev, [key]: result }));
    }
    return result;
  }, []);

  /** Forget past failures so the next prefetch tries the network again. */
  const resetFailures = useCallback(() => {
    requested.current.clear();
    setFailures({});
  }, []);

  return { online, loaded, refreshVersions, chapterTick, failures, loading, ensureChapter, resetFailures, chapterKey: keyOf };
}
