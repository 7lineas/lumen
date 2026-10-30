import { useCallback, useEffect, useState } from "react";
import type { AppSettings, BibleData, BibleVersionMeta } from "@shared/types";
import { fetchRangeTexts, getBible, loadBible } from "@shared/bible-service";
import {
  formatRange,
  parseReference,
  type VerseRange,
} from "@shared/reference";
import type { LumenClient } from "@/lib/lumen-client";
import { describeLumenError } from "@/lib/lumen-errors";
import { buildBlankPayload, buildVersePayload } from "./build-payload";
import { nextStageTarget } from "./step-target";

export type StagedVerse = {
  range: VerseRange;
  /** The version the texts were read in, which is not always the primary one. */
  versionId: string;
  referenceLabel: string;
  blocks: Array<{ label?: string; text: string }>;
};

/**
 * The operator's preview. Nothing reaches the projector until `projectStaged`,
 * matching the desktop app: browsing never changes what the congregation sees.
 */
export function useBibleStage(client: LumenClient | null) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [versions, setVersions] = useState<BibleVersionMeta[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedVerse | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    Promise.all([
      client.rpc<AppSettings>("settings:get"),
      client.rpc<BibleVersionMeta[]>("bibles:list"),
    ])
      .then(([current, list]) => {
        if (!active) return;
        // Locked versions need a licence the host has not accepted yet.
        const installed = list.filter((version) => !version.locked);
        setSettings(current);
        setVersions(installed);
        setVersionId(
          installed.some((version) => version.id === current.primaryVersionId)
            ? current.primaryVersionId
            : (installed[0]?.id ?? null),
        );
        setReady(true);
      })
      .catch((cause) => {
        if (active) setError(describeLumenError(cause));
      });
    return () => {
      active = false;
    };
  }, [client]);

  const ensureLoaded = useCallback(
    async (id: string) => {
      if (!client || getBible(id)) return;
      loadBible(await client.rpc<BibleData>("bibles:load", [id]));
    },
    [client],
  );

  /** Texts for `range` in `id`, plus the second version when dual view is on. */
  const textsFor = useCallback(
    async (id: string, range: VerseRange): Promise<StagedVerse | null> => {
      if (!settings) return null;
      const secondaryId = settings.dualView
        ? settings.secondaryVersionId
        : null;
      await ensureLoaded(id);
      if (secondaryId) await ensureLoaded(secondaryId);
      const texts = fetchRangeTexts(id, secondaryId, range);
      return texts ? { range, versionId: id, ...texts } : null;
    },
    [settings, ensureLoaded],
  );

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(describeLumenError(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const stageRange = useCallback(
    (range: VerseRange, id: string | null = versionId) =>
      run(async () => {
        if (!id) return;
        const next = await textsFor(id, range);
        if (!next) {
          setError("Ese pasaje no existe en esta versión.");
          return;
        }
        setStaged(next);
      }),
    [run, textsFor, versionId],
  );

  const stageReference = useCallback(
    (input: string) => {
      const parsed = parseReference(input);
      if (!parsed.ok) {
        setError(parsed.message);
        return Promise.resolve();
      }
      return stageRange(parsed.range);
    },
    [stageRange],
  );

  const selectVersion = useCallback(
    (id: string) => {
      setVersionId(id);
      // Keep the same passage, now read in the chosen version.
      if (staged) void stageRange(staged.range, id);
    },
    [staged, stageRange],
  );

  const stepBy = useCallback(
    (delta: 1 | -1) =>
      run(async () => {
        if (!staged || !versionId) return;
        await ensureLoaded(versionId);
        const bible = getBible(versionId);
        if (!bible) return;
        const next = nextStageTarget(staged.range, delta, bible);
        if (!next) {
          setError("No hay más versículos en esa dirección.");
          return;
        }
        const texts = await textsFor(versionId, { start: next, end: next });
        if (texts) setStaged(texts);
      }),
    [run, staged, versionId, ensureLoaded, textsFor],
  );

  const projectStaged = useCallback(
    () =>
      run(async () => {
        if (!client || !staged) return;
        // Re-read styling so the projector matches the desktop's current Ajustes.
        const current = await client.rpc<AppSettings>("settings:get");
        await client.rpc("projector:show", [
          buildVersePayload(current, staged),
        ]);
        await client.rpc("history:add", [
          {
            at: Date.now(),
            reference: formatRange(staged.range),
            versionId: staged.versionId,
          },
        ]);
      }),
    [client, run, staged],
  );

  const blankProjector = useCallback(
    () =>
      run(async () => {
        if (!client) return;
        const current = await client.rpc<AppSettings>("settings:get");
        await client.rpc("projector:show", [buildBlankPayload(current)]);
      }),
    [client, run],
  );

  return {
    ready,
    busy,
    error,
    versions,
    versionId,
    staged,
    selectVersion,
    stageReference,
    stepBy,
    projectStaged,
    blankProjector,
  };
}
