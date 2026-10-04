import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, HistoryEntry, ProjectorPayload, QueueEntry } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import { useBibleLoader } from "../hooks/useBibleLoader";
import { parseReference, formatRange, type VerseRange, type VerseRef } from "@shared/reference";
import {
  fetchRangeTexts,
  getBible,
  getChapterVerseCount,
  getVerseText,
  searchVerses,
} from "@shared/bible-service";
import { BOOKS } from "@shared/books";
import { rangeFromVerseClick } from "@shared/stage";
import { projectionCopyright } from "@shared/copyright-line";
import { backgroundImageUrl, isBackgroundVideo } from "@shared/background-image";
import { AboutModal } from "./AboutModal";
import { BiblesPanel } from "./BiblesPanel";
import { SettingsPanel } from "./SettingsPanel";
import { StageMonitor } from "./StageMonitor";
import { ChapterReader } from "./ChapterReader";
import { ServiceRundown } from "./ServiceRundown";
import { SongsWorkspace, type SongStage } from "./SongsWorkspace";
import { UpdateButton } from "./UpdateButton";
import lumenLogo from "../lumen-icon.png";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mergeSettings(s: AppSettings): AppSettings {
  return { ...DEFAULT_SETTINGS, ...s };
}

/**
 * The background (color/media) is permanent: it is projected from the moment
 * the app opens. Clearing ("Limpiar") only removes the text, so a blank
 * payload is just the background with empty content.
 */
function blankPayload(s: AppSettings): ProjectorPayload {
  return {
    mode: "blank",
    referenceLabel: "",
    blocks: [],
    churchName: s.churchName,
    fontSize: s.fontSize,
    brightness: s.brightness,
    padding: s.padding,
    theme: s.theme,
    backgroundColor: s.backgroundColor,
    copyright: "",
    referenceColor: s.referenceColor,
    versionColor: s.versionColor,
    fadeMs: s.fadeMs,
    backgroundFadeMs: s.backgroundFadeMs,
    backgroundImagePath: s.backgroundImagePath,
  };
}

export function OperatorApp() {
  const [deletingMedia, setDeletingMedia] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [refInput, setRefInput] = useState("Juan 3:16");
  const [keyword, setKeyword] = useState("");
  const [bookFilter, setBookFilter] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [staged, setStaged] = useState<VerseRange | null>(null);
  const [anchor, setAnchor] = useState<VerseRef | null>(null);
  const [viewBook, setViewBook] = useState("JHN");
  const [viewChapter, setViewChapter] = useState(3);
  const [live, setLive] = useState<ProjectorPayload | null>(null);
  const [liveRange, setLiveRange] = useState<VerseRange | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<"biblia" | "canciones">("biblia");
  const [songStaged, setSongStaged] = useState<SongStage | null>(null);
  const [songSelectedId, setSongSelectedId] = useState<string | null>(null);
  const [songLive, setSongLive] = useState<SongStage | null>(null);
  const [projectOnClick, setProjectOnClick] = useState(false);
  const [overlay, setOverlay] = useState<"ajustes" | "acerca" | "biblias" | null>(null);
  // Keep rendering the last non-null overlay while the sheet plays its
  // close animation. Clearing children/className synchronously on ESC makes
  // the panel go empty (and jump 460px -> 720px when leaving "ajustes")
  // mid-exit, which is the broken wide state with a bare left border.
  const [lastOverlay, setLastOverlay] = useState<typeof overlay>(null);
  useEffect(() => {
    if (overlay !== null) setLastOverlay(overlay);
  }, [overlay]);
  const activeOverlay = overlay ?? lastOverlay;
  const [libraryTick, setLibraryTick] = useState(0);
  const [projectorBounds, setProjectorBounds] = useState<{ width: number; height: number } | null>(null);
  const lastVerse = useRef<ProjectorPayload | null>(null);
  const booted = useRef(false);

  // Track the real projector window size so the live/preview monitors
  // render at the same ratio as the congregation screen, live.
  // Source of truth is the projector window content bounds (main pushes
  // updates on resize); the target display is only a fallback.
  useEffect(() => {
    let cancelled = false;
    const applyBounds = (b: { width: number; height: number } | null) => {
      if (!b || b.width <= 0 || b.height <= 0 || cancelled) return;
      setProjectorBounds((prev) => (
        prev?.width === b.width && prev?.height === b.height
          ? prev
          : { width: b.width, height: b.height }
      ));
    };
    const api = window.proyector;
    if (!api) return;
    // Live window bounds first; fall back to the target display.
    void api.getProjectorBounds?.().then(applyBounds).catch(() => undefined);
    const pickDisplay = (displays: Array<{ id: number; primary: boolean; bounds: { width: number; height: number } }>) => {
      if (displays.length === 0) return;
      const explicit = settings.projectorDisplayId != null
        ? displays.find((d) => d.id === settings.projectorDisplayId)
        : undefined;
      const target = explicit
        ?? displays.find((d) => !d.primary)
        ?? displays.find((d) => d.primary)
        ?? displays[0];
      if (target && !cancelled) {
        setProjectorBounds((prev) => (
          prev !== null ? prev : { width: target.bounds.width, height: target.bounds.height }
        ));
      }
    };
    void api.listDisplays().then((d) => { if (!cancelled) pickDisplay(d); }).catch(() => undefined);
    const off = api.onProjectorBounds?.(applyBounds);
    // Belt and braces: re-read the window size periodically so the panels
    // follow resizes even if a resize event is ever missed.
    const poll = window.setInterval(() => {
      if (cancelled || typeof api.getProjectorBounds !== "function") return;
      void api.getProjectorBounds().then(applyBounds).catch(() => undefined);
    }, 1000);
    return () => { cancelled = true; off?.(); window.clearInterval(poll); };
  }, [settings.projectorDisplayId]);

  const projectorAspect = useMemo(() => {
    if (!projectorBounds || projectorBounds.height <= 0) return 16 / 9;
    return projectorBounds.width / projectorBounds.height;
  }, [projectorBounds]);

  const projectorRatioLabel = useMemo(() => {
    if (!projectorBounds) return "16:9";
    const w = projectorBounds.width;
    const h = projectorBounds.height;
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const g = gcd(w, h) || 1;
    return `${w / g}:${h / g} · ${w}×${h}`;
  }, [projectorBounds]);

  const versionIds = useMemo(
    () =>
      [
        settings.primaryVersionId,
        settings.dualView && settings.secondaryVersionId ? settings.secondaryVersionId : null,
      ].filter(Boolean) as string[],
    [settings.primaryVersionId, settings.dualView, settings.secondaryVersionId],
  );

  const { ready, versions, error: loadError } = useBibleLoader(versionIds, libraryTick);

  const previewContent = useMemo(() => {
    // fetchRangeTexts already returns null while the selected Bible is not in
    // the cache. Do not gate this on the loader's transient `ready` flag:
    // switching between the song and Bible workspaces can otherwise leave the
    // preview empty for the rest of that render cycle.
    if (!staged) return null;
    return fetchRangeTexts(
      settings.primaryVersionId,
      settings.dualView ? settings.secondaryVersionId : null,
      staged,
    );
  }, [staged, settings.primaryVersionId, settings.dualView, settings.secondaryVersionId]);

  const previewPayload = useMemo<ProjectorPayload | null>(() => {
    if (!previewContent) return null;
    return {
      mode: "verse",
      referenceLabel: previewContent.referenceLabel,
      blocks: previewContent.blocks,
      churchName: settings.churchName,
      fontSize: settings.fontSize,
      brightness: settings.brightness,
      padding: settings.padding,
      theme: settings.theme,
      backgroundColor: settings.backgroundColor,
      copyright: projectionCopyright(
        settings.primaryVersionId,
        settings.dualView ? settings.secondaryVersionId : null,
        settings.showCopyright,
      ),
      referenceColor: settings.referenceColor,
      versionColor: settings.versionColor,
      backgroundImagePath: settings.backgroundImagePath,
      fadeMs: settings.fadeMs,
      backgroundFadeMs: settings.backgroundFadeMs,
    };
  }, [previewContent, settings]);

  const chrome = useCallback(
    (base: ProjectorPayload): ProjectorPayload => ({
      ...base,
      churchName: settings.churchName,
      fontSize: settings.fontSize,
      brightness: settings.brightness,
      padding: settings.padding,
      theme: settings.theme,
      backgroundColor: settings.backgroundColor,
      copyright:
        base.mode === "verse"
          ? projectionCopyright(
              settings.primaryVersionId,
              settings.dualView ? settings.secondaryVersionId : null,
              settings.showCopyright,
            )
          : "",
      referenceColor: settings.referenceColor,
      versionColor: settings.versionColor,
      backgroundImagePath: settings.backgroundImagePath,
      fadeMs: settings.fadeMs,
      backgroundFadeMs: settings.backgroundFadeMs,
    }),
    [settings],
  );

  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    void api.getSettings().then((s) => {
      const merged = mergeSettings(s);
      setSettings(merged);
      // Project the permanent background right away so the congregation
      // screen never sits black: color/media from the start, text empty.
      const initial = blankPayload(merged);
      setLive(initial);
      void api.showOnProjector(initial);
    });
    void api.getHistory().then(setHistory);
    void api.getQueue().then(setQueue);
    void api.openProjector();
  }, []);

  const stageRange = useCallback((range: VerseRange, nextAnchor?: VerseRef) => {
    setStaged(range);
    setAnchor(nextAnchor ?? range.start);
    setViewBook(range.start.book);
    setViewChapter(range.start.chapter);
    setParseError(null);
    setRefInput(formatRange(range));
  }, []);

  // The song workspace is mounted in place of the Bible reader. Keep the
  // selected Bible range available when returning to Bible mode, including
  // the case where the mode switch happens while a live verse is showing.
  useEffect(() => {
    if (mode !== "biblia" || staged || !liveRange) return;
    stageRange(liveRange);
  }, [mode, staged, liveRange, stageRange]);

  const switchMode = useCallback((next: "biblia" | "canciones") => {
    setMode(next);
    if (next !== "biblia" || staged) return;
    if (liveRange) {
      stageRange(liveRange);
      return;
    }
    const reference = lastVerse.current?.referenceLabel.split(" — ")[0];
    if (!reference) return;
    const parsed = parseReference(reference);
    if (parsed.ok) stageRange(parsed.range);
  }, [liveRange, stageRange, staged]);

  useEffect(() => {
    if (!ready || booted.current) return;
    booted.current = true;
    const parsed = parseReference("Juan 3:16");
    if (parsed.ok) stageRange(parsed.range);
  }, [ready, stageRange]);

  const [hasLiveContent, setHasLiveContent] = useState(false);

  const send = useCallback(async (payload: ProjectorPayload) => {
    setLive(payload);
    if (payload.mode === "verse") {
      lastVerse.current = payload;
      setHasLiveContent(true);
    }
    await window.proyector?.showOnProjector(payload);
  }, []);

  const projectStaged = useCallback(async () => {
    if (!previewPayload || !staged) return;
    setLiveRange(staged);
    await send(previewPayload);
    const entry: HistoryEntry = {
      at: Date.now(),
      reference: formatRange(staged),
      versionId: settings.primaryVersionId,
    };
    const next = await window.proyector?.addHistory(entry);
    if (next) setHistory(next);
  }, [previewPayload, staged, send, settings.primaryVersionId]);

  const songPayload = useCallback((_title: string, text: string): ProjectorPayload => ({
    mode: "verse",
    // Song titles are never projected; the operator sees them in the library.
    referenceLabel: "",
    blocks: [{ text }],
    churchName: settings.churchName,
    fontSize: settings.fontSize,
    brightness: settings.brightness,
    padding: settings.padding,
    theme: settings.theme,
    backgroundColor: settings.backgroundColor,
    copyright: "",
    referenceColor: settings.referenceColor,
    versionColor: settings.versionColor,
    backgroundImagePath: settings.backgroundImagePath,
    fadeMs: settings.fadeMs,
    backgroundFadeMs: settings.backgroundFadeMs,
  }), [settings]);

  const songPreviewPayload = useMemo<ProjectorPayload | null>(() => {
    if (!songStaged || songStaged.slides.length === 0) return null;
    const text = songStaged.slides[songStaged.index] ?? songStaged.slides[0];
    if (text == null) return null;
    return songPayload(songStaged.title, text);
  }, [songStaged, songPayload]);

  const selectSong = useCallback((songId: string, title: string, slides: string[]) => {
    setSongSelectedId(songId);
    setSongStaged(slides.length > 0 ? { title, slides, index: 0 } : null);
  }, []);

  const selectSongPart = useCallback((index: number) => {
    setSongStaged((current) => {
      if (!current || current.slides.length === 0) return current;
      const clamped = Math.min(Math.max(index, 0), current.slides.length - 1);
      const next = { ...current, index: clamped };
      const text = next.slides[clamped];
      if (projectOnClick && text != null) {
        setSongLive(next);
        void send(songPayload(next.title, text));
      }
      return next;
    });
  }, [projectOnClick, send, songPayload]);

  const projectSongStaged = useCallback(async () => {
    if (!songStaged || songStaged.slides.length === 0) return;
    const text = songStaged.slides[songStaged.index] ?? songStaged.slides[0];
    if (text == null) return;
    setSongLive(songStaged);
    await send(songPayload(songStaged.title, text));
  }, [songStaged, send, songPayload]);

  const navigateSongPreview = useCallback((delta: number) => {
    setSongStaged((current) => {
      if (!current || current.slides.length === 0) return current;
      const clamped = Math.min(Math.max(current.index + delta, 0), current.slides.length - 1);
      return clamped === current.index ? current : { ...current, index: clamped };
    });
  }, []);

  const navigateSongLive = useCallback(async (delta: number) => {
    const base = songLive;
    if (!base || base.slides.length === 0) return;
    const clamped = Math.min(Math.max(base.index + delta, 0), base.slides.length - 1);
    if (clamped === base.index) return;
    const next = { ...base, index: clamped };
    const text = next.slides[clamped];
    if (text == null) return;
    setSongLive(next);
    await send(songPayload(next.title, text));
  }, [songLive, send, songPayload]);

  const showBlank = useCallback(async () => {
    // "Limpiar" clears only the text (verse/song). Background color and
    // media stay so the projector keeps showing them behind empty content.
    await send(blankPayload(settings));
  }, [send, settings]);

  const toggleBlank = useCallback(async () => {
    if (live?.mode === "blank") {
      if (lastVerse.current) await send(chrome(lastVerse.current));
      return;
    }
    await showBlank();
  }, [live, send, chrome, showBlank]);

  const applyChrome = useCallback(
    async (next: AppSettings) => {
      setSettings(next);
      await window.proyector?.setSettings(next);
      if (!live) return;
      if (live.mode === "blank") {
        // Keep a cleared screen in sync with background/theme tweaks so
        // changing the fondo or media while "Limpiar" is active still shows.
        await send({
          ...live,
          churchName: next.churchName,
          fontSize: next.fontSize,
          brightness: next.brightness,
          padding: next.padding,
          theme: next.theme,
          backgroundColor: next.backgroundColor,
          backgroundImagePath: next.backgroundImagePath,
          referenceColor: next.referenceColor,
          versionColor: next.versionColor,
          fadeMs: next.fadeMs,
          backgroundFadeMs: next.backgroundFadeMs,
        });
        return;
      }
      await send({
        ...live,
        churchName: next.churchName,
        fontSize: next.fontSize,
        brightness: next.brightness,
        padding: next.padding,
        theme: next.theme,
        backgroundColor: next.backgroundColor,
        backgroundImagePath: next.backgroundImagePath,
        referenceColor: next.referenceColor,
        versionColor: next.versionColor,
        fadeMs: next.fadeMs,
        backgroundFadeMs: next.backgroundFadeMs,
        copyright:
          live.mode === "verse"
            ? projectionCopyright(
                next.primaryVersionId,
                next.dualView ? next.secondaryVersionId : null,
                next.showCopyright,
              )
            : "",
      });
    },
    [live, send],
  );

  const resolveFromInput = useCallback(() => {
    const parsed = parseReference(refInput);
    if (!parsed.ok) {
      setParseError(parsed.message);
      return;
    }
    stageRange(parsed.range);
  }, [refInput, stageRange]);

  const navigateVerse = useCallback(
    (delta: number) => {
      const ref = staged?.start;
      if (!ref) return;
      const bible = getBible(settings.primaryVersionId);
      if (!bible) return;
      let chapter = ref.chapter;
      let verse = ref.verse + delta;
      const book = ref.book;
      const maxInChapter = getChapterVerseCount(bible, book, chapter);
      if (verse > maxInChapter) {
        chapter += 1;
        verse = 1;
      } else if (verse < 1) {
        chapter -= 1;
        if (chapter < 1) return;
        verse = getChapterVerseCount(bible, book, chapter) || 1;
      }
      const bookMeta = BOOKS.find((b) => b.code === book);
      if (!bookMeta || chapter > bookMeta.chapters) return;
      if (!getVerseText(bible, { book, chapter, verse })) return;
      stageRange({
        start: { book, chapter, verse },
        end: { book, chapter, verse },
      });
    },
    [staged, settings.primaryVersionId, stageRange],
  );

  const projectReference = useCallback(
    async (reference: string, id?: string) => {
      const parsed = parseReference(reference);
      if (!parsed.ok) return;
      stageRange(parsed.range);
      if (id) setActiveId(id);
      const content = fetchRangeTexts(
        settings.primaryVersionId,
        settings.dualView ? settings.secondaryVersionId : null,
        parsed.range,
      );
      if (!content) return;
      setLiveRange(parsed.range);
      await send({
        mode: "verse",
        referenceLabel: content.referenceLabel,
        blocks: content.blocks,
        churchName: settings.churchName,
        fontSize: settings.fontSize,
        brightness: settings.brightness,
      padding: settings.padding,
        theme: settings.theme,
        backgroundColor: settings.backgroundColor,
        copyright: projectionCopyright(
          settings.primaryVersionId,
          settings.dualView ? settings.secondaryVersionId : null,
          settings.showCopyright,
        ),
        referenceColor: settings.referenceColor,
        versionColor: settings.versionColor,
        backgroundImagePath: settings.backgroundImagePath,
        fadeMs: settings.fadeMs,
        backgroundFadeMs: settings.backgroundFadeMs,
      });
    },
    [stageRange, settings, send],
  );

  const navigateLive = useCallback(
    async (delta: number) => {
      const base = liveRange ?? staged;
      const ref = base?.start;
      if (!ref) return;
      const bible = getBible(settings.primaryVersionId);
      if (!bible) return;
      let chapter = ref.chapter;
      let verse = ref.verse + delta;
      const book = ref.book;
      const maxInChapter = getChapterVerseCount(bible, book, chapter);
      if (verse > maxInChapter) {
        chapter += 1;
        verse = 1;
      } else if (verse < 1) {
        chapter -= 1;
        if (chapter < 1) return;
        verse = getChapterVerseCount(bible, book, chapter) || 1;
      }
      const bookMeta = BOOKS.find((b) => b.code === book);
      if (!bookMeta || chapter > bookMeta.chapters) return;
      if (!getVerseText(bible, { book, chapter, verse })) return;
      const next = {
        start: { book, chapter, verse },
        end: { book, chapter, verse },
      };
      const content = fetchRangeTexts(
        settings.primaryVersionId,
        settings.dualView ? settings.secondaryVersionId : null,
        next,
      );
      if (!content) return;
      setLiveRange(next);
      await send({
        mode: "verse",
        referenceLabel: content.referenceLabel,
        blocks: content.blocks,
        churchName: settings.churchName,
        fontSize: settings.fontSize,
        brightness: settings.brightness,
      padding: settings.padding,
        theme: settings.theme,
        backgroundColor: settings.backgroundColor,
        copyright: projectionCopyright(
          settings.primaryVersionId,
          settings.dualView ? settings.secondaryVersionId : null,
          settings.showCopyright,
        ),
        referenceColor: settings.referenceColor,
        versionColor: settings.versionColor,
        backgroundImagePath: settings.backgroundImagePath,
        fadeMs: settings.fadeMs,
        backgroundFadeMs: settings.backgroundFadeMs,
      });
    },
    [liveRange, staged, settings, send],
  );

  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    return api.onOperatorShortcut(({ action }) => {
      if (action === "blank") void toggleBlank();
      else if (action === "prev") navigateVerse(-1);
      else if (action === "next") navigateVerse(1);
    });
  }, [toggleBlank, navigateVerse]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Enter" && e.target.dataset.role === "ref") {
          e.preventDefault();
          resolveFromInput();
        }
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateVerse(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateVerse(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void projectStaged();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigateVerse, projectStaged, resolveFromInput]);

  const searchResults = useMemo(() => {
    if (!keyword.trim() || !ready) return [];
    return searchVerses(settings.primaryVersionId, keyword, 30);
  }, [keyword, ready, settings.primaryVersionId]);

  const persistQueue = async (q: QueueEntry[]) => {
    setQueue(q);
    await window.proyector?.setQueue(q);
  };

  const goNext = () => {
    if (queue.length === 0) return;
    const idx = queue.findIndex((q) => q.id === activeId);
    const next = queue[idx + 1] ?? queue[0];
    if (!next) return;
    void projectReference(next.reference, next.id);
  };

  const liveKey =
    liveRange && live?.mode === "verse"
      ? `${liveRange.start.book}:${liveRange.start.chapter}:${liveRange.start.verse}`
      : null;

  if (loadError) {
    return (
      <div className="app-shell error-state">
        <h1>Error</h1>
        <p>{loadError}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-left">
          <div className="brand">
            <img className="brand-logo" src={lumenLogo} alt="" aria-hidden />
            <h1>Lumen</h1>
          </div>
          <div className="modes">
            <Button type="button" data-testid="mode-biblia" className={mode === "biblia" ? "active" : ""} onClick={() => switchMode("biblia")}>
              Biblia
            </Button>
            <Button type="button" data-testid="mode-canciones" className={mode === "canciones" ? "active" : ""} onClick={() => switchMode("canciones")}>
              Canciones
            </Button>
            <span className="top-sep" aria-hidden />
            <UpdateButton />
          </div>
        </div>
        <div className="top-right">
          <label className="version-select">
            Versión
            <Select
              value={settings.primaryVersionId}
              items={versions.map((v) => ({ value: v.id, label: v.abbr }))}
              onValueChange={(value) => value && void applyChrome({ ...settings, primaryVersionId: value })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.abbr}
                </SelectItem>
              ))}
              </SelectContent>
            </Select>
          </label>
          <span className="top-sep" aria-hidden />
          <div className="tabs">
            <Button
              type="button"
              data-testid="tab-biblias"
              className={overlay === "biblias" ? "active" : ""}
              onClick={() => setOverlay(overlay === "biblias" ? null : "biblias")}
            >
              Biblias
            </Button>
            <Button
              type="button"
              data-testid="tab-ajustes"
              className={overlay === "ajustes" ? "active" : ""}
              onClick={() => setOverlay(overlay === "ajustes" ? null : "ajustes")}
            >
              Ajustes
            </Button>
            <Button
              type="button"
              className={overlay === "acerca" ? "active" : ""}
              onClick={() => setOverlay(overlay === "acerca" ? null : "acerca")}
            >
              Acerca de
            </Button>
          </div>
        </div>
      </header>

      <div className={`workspace ${mode === "canciones" ? "songs-mode" : ""}`}>
        {mode === "canciones" ? (
          <SongsWorkspace
            staged={songStaged}
            selectedId={songSelectedId}
            projectOnClick={projectOnClick}
            onToggleProjectOnClick={setProjectOnClick}
            onSelectSong={selectSong}
            onSelectPart={selectSongPart}
          />
        ) : <ChapterReader
          versionId={settings.primaryVersionId}
          ready={ready}
          viewBook={viewBook}
          viewChapter={viewChapter}
          staged={staged}
          liveKey={liveKey}
          bookFilter={bookFilter}
          onBookFilter={setBookFilter}
          onSelectBook={(code) => {
            setViewBook(code);
            setViewChapter(1);
          }}
          onSelectChapter={setViewChapter}
          onVerseClick={(verse, shiftKey) => {
            const next = rangeFromVerseClick(anchor, viewBook, viewChapter, verse, shiftKey);
            stageRange(next.range, next.anchor);
          }}
          onVerseDoubleClick={(verse) => {
            const next = rangeFromVerseClick(null, viewBook, viewChapter, verse, false);
            stageRange(next.range, next.anchor);
            void projectReference(formatRange(next.range));
          }}
          refInput={refInput}
          onRefInput={setRefInput}
          onRefSubmit={resolveFromInput}
          parseError={parseError}
          keyword={keyword}
          onKeyword={setKeyword}
          searchResults={searchResults}
          onSearchPick={(hit) =>
            stageRange({
              start: { book: hit.book, chapter: hit.chapter, verse: hit.verse },
              end: { book: hit.book, chapter: hit.chapter, verse: hit.verse },
            })
          }
        />}

        <section className="stage-col">
          {!ready && mode === "biblia" && <p className="muted">Cargando textos bíblicos…</p>}
          <div className="monitors">
            <div className="monitor-col">
              <StageMonitor
                title="Vista previa"
                payload={mode === "canciones" ? songPreviewPayload : previewPayload}
                empty={mode === "canciones" ? "Elija una parte de la canción" : "Elija un versículo"}
                testId="preview-box"
                aspectRatio={projectorAspect}
                displayWidth={projectorBounds?.width}
                ratioLabel={projectorRatioLabel}
              />
              <div className="action-row">
                {mode === "canciones" ? <>
                  <Button type="button" className="primary" data-testid="btn-project" onClick={() => void projectSongStaged()}>
                    Proyectar
                  </Button>
                  <Button type="button" onClick={() => navigateSongPreview(-1)}>
                    ◀ Anterior
                  </Button>
                  <Button type="button" onClick={() => navigateSongPreview(1)}>
                    Siguiente ▶
                  </Button>
                </> : <>
                  <Button type="button" className="primary" data-testid="btn-project" onClick={() => void projectStaged()}>
                    Proyectar
                  </Button>
                  <Button type="button" onClick={() => navigateVerse(-1)}>
                    ◀ Anterior
                  </Button>
                  <Button type="button" onClick={() => navigateVerse(1)}>
                    Siguiente ▶
                  </Button>
                </>}
              </div>
            </div>
            <div className="monitor-col">
              <StageMonitor
                title="En vivo"
                payload={live}
                testId="live-box"
                isLive
                aspectRatio={projectorAspect}
                displayWidth={projectorBounds?.width}
                ratioLabel={projectorRatioLabel}
              />
              <div className="action-row">
                <Button
                  type="button"
                  variant="destructive"
                  data-testid="btn-clear"
                  onClick={() => void toggleBlank()}
                >
                  {live?.mode === "blank" && hasLiveContent ? "Restaurar" : "Limpiar"}
                </Button>
                {mode === "canciones" ? <>
                  <Button type="button" data-testid="btn-live-prev" onClick={() => void navigateSongLive(-1)}>
                    ◀ Anterior
                  </Button>
                  <Button type="button" data-testid="btn-live-next" onClick={() => void navigateSongLive(1)}>
                    Siguiente ▶
                  </Button>
                </> : <>
                  <Button type="button" data-testid="btn-live-prev" onClick={() => void navigateLive(-1)}>
                    ◀ Anterior
                  </Button>
                  <Button type="button" data-testid="btn-live-next" onClick={() => void navigateLive(1)}>
                    Siguiente ▶
                  </Button>
                </>}
              </div>
            </div>
          </div>
          <div className="stage-background">
            <span className="tweak-head">
              <span>Fondo</span>
            </span>
            <div className="stage-background-row">
              <Button
                type="button"
                className={!settings.backgroundImagePath ? "background-solid active" : "background-solid"}
                aria-pressed={!settings.backgroundImagePath}
                onClick={() => void applyChrome({ ...settings, backgroundImagePath: null })}
              >
                Color sólido
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  const path = await window.proyector?.pickBackgroundImage();
                  if (!path) return;
                  // New uploads join the library but never auto-project: the
                  // operator picks explicitly from the gallery.
                  if ((settings.backgroundImages ?? []).includes(path)) return;
                  void applyChrome({
                    ...settings,
                    backgroundImages: [...(settings.backgroundImages ?? []), path],
                  });
                }}
              >
                Añadir media
              </Button>
              {(settings.backgroundImages ?? []).length > 0 && (
                <Button type="button" variant={deletingMedia ? "destructive" : "secondary"} onClick={() => setDeletingMedia((value) => !value)}>
                  {deletingMedia ? "Cancelar eliminación" : "Eliminar media"}
                </Button>
              )}
            </div>
            {(settings.backgroundImages ?? []).length > 0 && (
              <div className="background-gallery" aria-label="Imágenes de fondo guardadas">
                {settings.backgroundImages.map((imagePath, index) => (
                  <div key={`${imagePath}-${index}`} className="background-choice-wrap">
                    <button type="button" className={`background-choice${settings.backgroundImagePath === imagePath ? " active" : ""}`} aria-label={deletingMedia ? `Eliminar media ${index + 1}` : `Usar media ${index + 1}`} aria-pressed={settings.backgroundImagePath === imagePath} onClick={() => { if (!deletingMedia) void applyChrome({ ...settings, backgroundImagePath: imagePath }); }}>
                      {isBackgroundVideo(imagePath) ? <video src={backgroundImageUrl(imagePath)} muted loop autoPlay playsInline preload="auto" onCanPlay={(event) => { void event.currentTarget.play().catch(() => undefined); }} /> : <img src={backgroundImageUrl(imagePath)} alt="" />}
                    </button>
                    {deletingMedia && <AlertDialog>
                      <AlertDialogTrigger render={<Button type="button" variant="destructive" className="background-delete">Eliminar</Button>} />
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Eliminar media</AlertDialogTitle><AlertDialogDescription>¿Quieres eliminar este archivo de la biblioteca de fondos?</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void (async () => { await window.proyector?.deleteBackgroundMedia(imagePath); void applyChrome({ ...settings, backgroundImages: settings.backgroundImages.filter((item) => item !== imagePath), backgroundImagePath: settings.backgroundImagePath === imagePath ? null : settings.backgroundImagePath }); })()}>Eliminar</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="stage-tweaks">
            <label className="tweak">
              <span className="tweak-head">
                <span>Fuente</span>
                <span className="tweak-val">{settings.fontSize}px</span>
              </span>
              <Slider
                min={40}
                max={110}
                value={[settings.fontSize]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  void applyChrome({ ...settings, fontSize: next ?? settings.fontSize });
                }}
              />
            </label>
            <label className="tweak">
              <span className="tweak-head">
                <span>Luz</span>
                <span className="tweak-val">{Math.round(settings.brightness * 100)}%</span>
              </span>
              <Slider
                min={35}
                max={100}
                value={[Math.round(settings.brightness * 100)]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  void applyChrome({ ...settings, brightness: (next ?? Math.round(settings.brightness * 100)) / 100 });
                }}
              />
            </label>
            <label className="tweak">
              <span className="tweak-head">
                <span>Padding</span>
                <span className="tweak-val">{settings.padding}vw</span>
              </span>
              <Slider
                min={0}
                max={12}
                value={[settings.padding]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  void applyChrome({ ...settings, padding: next ?? settings.padding });
                }}
              />
            </label>
          </div>
        </section>

        {mode === "biblia" && <ServiceRundown
          queue={queue}
          activeId={activeId}
          history={history}
          onProject={(item) => void projectReference(item.reference, item.id)}
          onRemove={(id) => void persistQueue(queue.filter((q) => q.id !== id))}
          onMove={(index, dir) => {
            const target = index + dir;
            if (target < 0 || target >= queue.length) return;
            const copy = [...queue];
            const current = copy[index];
            const swap = copy[target];
            if (!current || !swap) return;
            copy[index] = swap;
            copy[target] = current;
            void persistQueue(copy);
          }}
          onNext={goNext}
          onAddCurrent={() => {
            if (!staged) return;
            void persistQueue([...queue, { id: newId(), reference: formatRange(staged) }]);
          }}
          onHistory={(reference) => {
            const parsed = parseReference(reference);
            if (parsed.ok) stageRange(parsed.range);
          }}
        />}
      </div>

      <Sheet open={overlay !== null} onOpenChange={(open) => !open && setOverlay(null)}>
        <SheetContent
          side="right"
          data-testid={activeOverlay === "ajustes" ? "settings-panel" : undefined}
          className={activeOverlay === "ajustes" ? "overlay-sheet settings-sheet" : "overlay-sheet wide-sheet"}
        >
          {activeOverlay === "ajustes" && <SettingsPanel settings={settings} versions={versions} onSave={async (s) => { await applyChrome(s); setOverlay(null); }} />}
          {activeOverlay === "biblias" && (
            <BiblesPanel
              onChanged={(next) => {
                if (next) setSettings(mergeSettings(next));
                setLibraryTick((tick) => tick + 1);
              }}
            />
          )}
          {activeOverlay === "acerca" && <AboutModal />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
