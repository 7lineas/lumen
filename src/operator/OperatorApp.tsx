import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Church, Keyboard, Palette, Timer, Video, X } from "lucide-react";
import type { AppSettings, HistoryEntry, ProjectorPayload, QueueEntry, VideoPlayback } from "@shared/types";
import { DEFAULT_SETTINGS, MAX_QUEUE_ITEMS, mediaKind } from "@shared/types";
import { useBibleLoader } from "../hooks/useBibleLoader";
import { useOnlineBibles } from "../hooks/useOnlineBibles";
import { hasChapter, isOnlineVersionId } from "@shared/youversion";
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
import { backgroundImageUrl, backgroundThumbnailUrl, isBackgroundVideo } from "@shared/background-image";
import { payloadContentKey, videoPosition } from "@shared/stage";
import { AboutModal } from "./AboutModal";
import { BiblesPanel } from "./BiblesPanel";
import { SettingsPanel } from "./SettingsPanel";
import { StageMonitor } from "./StageMonitor";
import { BibleWorkspace } from "./BibleWorkspace";
import { SavedStrip } from "./SavedStrip";
import { SongsWorkspace, type SongSelection, type SongStage } from "./SongsWorkspace";
import { MediaWorkspace, type MediaItem, type SlideStage } from "./MediaWorkspace";
import { AudioDock, type AudioTrack } from "./AudioDock";
import { VideoTransport } from "./VideoTransport";
import { FitToggle } from "./FitToggle";
import { MODE_ORDER, ModeSwitch, type OperatorMode } from "./ModeSwitch";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { UpdateButton, UpdateCheckButton } from "./UpdateButton";
import { WindowControls } from "./WindowControls";
import { createBackgroundVideoThumbnail } from "./background-thumbnail";
import lumenLogo from "../lumen-icon.png";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Library and slide buttons where Enter projects the preview instead of pressing the button again. */
const TAKE_ON_ENTER = ".lx-card, .lx-item-main, .lx-chaps button, .lx-arr-pick, .lx-result";

/** Columns of the slide grid on screen, so ↑ and ↓ move by one row. */
function gridColumns(): number {
  const grid = document.querySelector(".lx-slides");
  if (!grid) return 1;
  return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
}

/** Minutes offered for the countdown screen. */
const COUNTDOWN_OPTIONS = [1, 3, 5, 10, 15, 20].map((minutes) => ({ value: String(minutes), label: `${minutes} min` }));
/** Caption above the countdown on the projector. */
const COUNTDOWN_CAPTION = "Comenzamos en";
const OVERLAY_TITLES = { ajustes: "Ajustes", acerca: "Acerca de Lumen", biblias: "Biblias" } as const;

/** Settings persisted before the accent/song-fade split. */
type StoredSettings = Partial<AppSettings> & {
  referenceColor?: string;
  versionColor?: string;
};

function mergeSettings(s: StoredSettings): AppSettings {
  const fadeMs = s.fadeMs ?? DEFAULT_SETTINGS.fadeMs;
  // Legacy key from before the copyright footer was removed: never persisted again.
  const rest = { ...s };
  delete (rest as Record<string, unknown>).showCopyright;
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    accentColor:
      s.accentColor ?? s.referenceColor ?? s.versionColor ?? DEFAULT_SETTINGS.accentColor,
    fadeMs,
    songFadeMs: s.songFadeMs ?? fadeMs,
  };
}

/**
 * The background (color/media) is permanent: it is projected from the moment
 * the app opens. Clearing ("Limpiar") only removes the text, so a blank
 * payload is just the background with empty content.
 */
function blankPayload(s: AppSettings, fadeMs?: number): ProjectorPayload {
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
    referenceColor: s.accentColor,
    versionColor: s.accentColor,
    fadeMs: fadeMs ?? s.fadeMs,
    backgroundFadeMs: s.backgroundFadeMs,
    backgroundImagePath: s.backgroundImagePath,
  };
}

function BackgroundLibraryPreview({ filePath }: { filePath: string }) {
  const video = isBackgroundVideo(filePath);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  if (video) {
    const thumbnail = backgroundThumbnailUrl(filePath);
    return thumbnail && !thumbnailFailed
      ? <img src={thumbnail} alt="" onError={() => {
        setThumbnailFailed(true);
        if (!window.__LUMEN_BROWSER__) {
          void createBackgroundVideoThumbnail(filePath).then((created) => {
            if (created) setThumbnailFailed(false);
          });
        }
      }} />
      : <span className="background-video-placeholder"><Video aria-hidden="true" /><span>Video</span></span>;
  }
  return <img src={backgroundImageUrl(filePath)} alt="" />;
}

export function OperatorApp() {
  const [deletingMedia, setDeletingMedia] = useState(false);
  const [backgroundImportBusy, setBackgroundImportBusy] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [keyword, setKeyword] = useState("");
  const [staged, setStaged] = useState<VerseRange | null>(null);
  const [anchor, setAnchor] = useState<VerseRef | null>(null);
  const [viewBook, setViewBook] = useState("JHN");
  const [viewChapter, setViewChapter] = useState(3);
  const [live, setLive] = useState<ProjectorPayload | null>(null);
  // Mirror of `live` for callbacks that must compare with the previous payload
  // (they are memoised with empty deps, so state would be stale there).
  const liveRef = useRef<ProjectorPayload | null>(null);
  // When the content on the live screen last changed; drives the live timer.
  const [liveSince, setLiveSince] = useState<number | null>(null);
  const [liveRange, setLiveRange] = useState<VerseRange | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<OperatorMode>("biblia");
  const [songStaged, setSongStaged] = useState<SongStage | null>(null);
  const [songSelectedId, setSongSelectedId] = useState<string | null>(null);
  const [songLive, setSongLive] = useState<SongStage | null>(null);
  const [slideStaged, setSlideStaged] = useState<SlideStage | null>(null);
  const [mediaSelected, setMediaSelected] = useState<MediaItem | null>(null);
  const [slideLive, setSlideLive] = useState<SlideStage | null>(null);
  // Video on the projector: its name, its length once the live monitor reads it, and the volume to start with.
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoVolume, setVideoVolume] = useState(1);
  const [audioTrack, setAudioTrack] = useState<AudioTrack | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [projectOnClick, setProjectOnClick] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [countdownMinutes, setCountdownMinutes] = useState(5);
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
  useEffect(() => {
    document.documentElement.dataset.overlayMotion = settings.overlayAnimation ? "on" : "off";
  }, [settings.overlayAnimation]);
  const [libraryTick, setLibraryTick] = useState(0);
  const [projectorBounds, setProjectorBounds] = useState<{ width: number; height: number } | null>(null);
  const lastVerse = useRef<ProjectorPayload | null>(null);
  const lastContent = useRef<ProjectorPayload | null>(null);
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

  // Online Bibles (YouVersion). If the selected one cannot be read right now
  // (offline, rate limited, license not accepted) the operator keeps working
  // with RV1909, which ships with the app; this is derived, not persisted.
  const onlineBibles = useOnlineBibles();
  const primaryOnline = isOnlineVersionId(settings.primaryVersionId);
  const primaryMeta = onlineBibles.online.versions.find((v) => v.id === settings.primaryVersionId);
  const visibleFailure = primaryOnline
    ? onlineBibles.failures[onlineBibles.chapterKey({ versionId: settings.primaryVersionId, book: viewBook, chapter: viewChapter })]
    : undefined;
  const onlineUnavailable = primaryOnline && (
    (onlineBibles.loaded && (!primaryMeta || !!primaryMeta.locked)) ||
    (!!visibleFailure && visibleFailure.reason !== "not-found")
  );
  const primaryId = onlineUnavailable ? "rv1909" : settings.primaryVersionId;
  const onlineNotice = !onlineUnavailable ? null
    : primaryMeta?.locked ? `${primaryMeta.lockedReason ?? "Licencia no aceptada"}. Se usa RV1909.`
    : !visibleFailure ? "Esa Biblia en línea no está disponible. Se usa RV1909."
    : visibleFailure.reason === "offline" ? "Sin conexión con YouVersion: se usa RV1909 (los capítulos ya consultados siguen disponibles)."
    : visibleFailure.reason === "rate-limited" ? `YouVersion pidió esperar${visibleFailure.retryAfterSec ? ` ${Math.max(1, Math.ceil(visibleFailure.retryAfterSec / 60))} min` : ""}: se usa RV1909.`
    : `${visibleFailure.message}. Se usa RV1909.`;

  const versionIds = useMemo(
    () =>
      [
        primaryId,
        settings.dualView && settings.secondaryVersionId ? settings.secondaryVersionId : null,
      ].filter(Boolean) as string[],
    [primaryId, settings.dualView, settings.secondaryVersionId],
  );

  const { ready, versions, error: loadError } = useBibleLoader(versionIds, libraryTick, onlineBibles.online.versions);
  const allVersions = useMemo(() => [...versions, ...onlineBibles.online.versions], [versions, onlineBibles.online.versions]);

  // Prefetch the visible chapter first, then the staged/live ones and the
  // neighbours, one at a time (the API limit is per key). Skipped while the
  // fallback is active so an offline church does not retry in a loop.
  useEffect(() => {
    if (onlineUnavailable) return;
    const ids = [settings.primaryVersionId, settings.dualView ? settings.secondaryVersionId : null]
      .filter((id): id is string => !!id && isOnlineVersionId(id));
    if (ids.length === 0 || !onlineBibles.online.configured) return;
    const neighbours = (book: string, chapter: number) => {
      const at = BOOKS.findIndex((b) => b.code === book);
      if (at < 0) return [];
      const out: Array<{ book: string; chapter: number }> = [];
      if (chapter < BOOKS[at].chapters) out.push({ book, chapter: chapter + 1 });
      else if (BOOKS[at + 1]) out.push({ book: BOOKS[at + 1].code, chapter: 1 });
      if (chapter > 1) out.push({ book, chapter: chapter - 1 });
      else if (BOOKS[at - 1]) out.push({ book: BOOKS[at - 1].code, chapter: BOOKS[at - 1].chapters });
      return out;
    };
    const targets: Array<{ book: string; chapter: number }> = [{ book: viewBook, chapter: viewChapter }];
    if (staged) targets.push({ book: staged.start.book, chapter: staged.start.chapter }, { book: staged.end.book, chapter: staged.end.chapter });
    if (liveRange) targets.push({ book: liveRange.start.book, chapter: liveRange.start.chapter });
    targets.push(...neighbours(viewBook, viewChapter));
    if (liveRange) targets.push(...neighbours(liveRange.start.book, liveRange.start.chapter));
    const seen = new Set<string>();
    let cancelled = false;
    void (async () => {
      for (const target of targets) {
        for (const versionId of ids) {
          const key = `${versionId}/${target.book}.${target.chapter}`;
          if (seen.has(key) || cancelled) continue;
          seen.add(key);
          if (hasChapter(getBible(versionId), target.book, target.chapter)) continue;
          await onlineBibles.ensureChapter({ versionId, book: target.book, chapter: target.chapter });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineUnavailable, settings.primaryVersionId, settings.dualView, settings.secondaryVersionId, viewBook, viewChapter, staged, liveRange, onlineBibles.online.configured, onlineBibles.failures]);

  const previewContent = useMemo(() => {
    // fetchRangeTexts already returns null while the selected Bible is not in
    // the cache. Do not gate this on the loader's transient `ready` flag:
    // switching between the song and Bible workspaces can otherwise leave the
    // preview empty for the rest of that render cycle.
    if (!staged) return null;
    return fetchRangeTexts(
      primaryId,
      settings.dualView ? settings.secondaryVersionId : null,
      staged,
    );
  // chapterTick: online chapters are merged into the cached Bible in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staged, primaryId, settings.dualView, settings.secondaryVersionId, onlineBibles.chapterTick]);

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
      referenceColor: settings.accentColor,
      versionColor: settings.accentColor,
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
      referenceColor: settings.accentColor,
      versionColor: settings.accentColor,
      backgroundImagePath: settings.backgroundImagePath,
      // Keep the fade the content was projected with: bible and songs have
      // separate transition settings.
      fadeMs: base.fadeMs ?? settings.fadeMs,
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
      liveRef.current = initial;
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
  }, []);

  // The song workspace is mounted in place of the Bible reader. Keep the
  // selected Bible range available when returning to Bible mode, including
  // the case where the mode switch happens while a live verse is showing.
  useEffect(() => {
    if (mode !== "biblia" || staged || !liveRange) return;
    stageRange(liveRange);
  }, [mode, staged, liveRange, stageRange]);

  const switchMode = useCallback((next: OperatorMode) => {
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
    const previous = liveRef.current;
    liveRef.current = payload;
    setLive(payload);
    // Only a real change of content restarts the live timer; style-only
    // updates (font, brightness, background) keep it running.
    if (payload.mode === "blank") setLiveSince(null);
    else if (payloadContentKey(previous) !== payloadContentKey(payload)) setLiveSince(Date.now());
    if (payload.mode === "verse") {
      lastVerse.current = payload;
    }
    // Verses, songs and slides are restorable: "Limpiar" only removes the text
    // above the permanent background. Logo and countdown are not restored.
    if (payload.mode === "verse" || payload.mode === "slides") {
      lastContent.current = payload;
      setHasLiveContent(true);
    } else if (payload.mode === "video") {
      // A video is not brought back by "Restaurar": it would resume out of step.
      lastContent.current = null;
      setHasLiveContent(false);
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
      versionId: primaryId,
    };
    const next = await window.proyector?.addHistory(entry);
    if (next) setHistory(next);
  }, [previewPayload, staged, send, primaryId]);

  const songPayload = useCallback((_title: string, text: string): ProjectorPayload => ({
    mode: "verse",
    // Song titles are never projected; the operator sees them in the library.
    referenceLabel: "",
    blocks: [{ text: settings.songUppercase ? text.toUpperCase() : text }],
    churchName: settings.churchName,
    fontSize: settings.fontSize,
    brightness: settings.brightness,
    padding: settings.padding,
    theme: settings.theme,
    backgroundColor: settings.backgroundColor,
    referenceColor: settings.accentColor,
    versionColor: settings.accentColor,
    backgroundImagePath: settings.backgroundImagePath,
    fadeMs: settings.songFadeMs,
    backgroundFadeMs: settings.backgroundFadeMs,
  }), [settings]);

  const slidePayload = useCallback((imagePath: string | null): ProjectorPayload => ({
    ...songPayload("", ""),
    mode: "slides",
    // A diapositiva is just its image: no text blocks.
    blocks: [],
    slideImagePath: imagePath,
    // Slides fade in/out/between with the same backgroundFadeMs as the
    // background media (no separate setting), and the background switches to
    // the solid color while they are shown (see ProjectorView / StageMonitor).
    fadeMs: settings.backgroundFadeMs,
  }), [songPayload, settings.backgroundFadeMs]);

  const songPreviewPayload = useMemo<ProjectorPayload | null>(() => {
    if (!songStaged || songStaged.slides.length === 0) return null;
    const text = songStaged.slides[songStaged.index] ?? songStaged.slides[0];
    if (text == null) return null;
    return songPayload(songStaged.title, text);
  }, [songStaged, songPayload]);

  const selectSong = useCallback((songId: string | null, selection: SongSelection | null) => {
    setSongSelectedId(songId);
    setSongStaged(
      selection && selection.slides.length > 0
        ? { title: selection.title, slides: selection.slides, labels: selection.labels, index: selection.index ?? 0 }
        : null,
    );
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

  const takeSongPart = useCallback((index: number) => {
    if (!songStaged) return;
    const text = songStaged.slides[index];
    if (text == null) return;
    const next = { ...songStaged, index };
    setSongStaged(next);
    setSongLive(next);
    void send(songPayload(next.title, text));
  }, [songStaged, send, songPayload]);

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

  const selectMedia = useCallback((item: MediaItem | null) => {
    setMediaSelected(item);
    setSlideStaged(item && mediaKind(item) === "slides" && item.images.length
      ? { deckId: item.id, title: item.title, images: item.images, index: 0 }
      : null);
  }, []);
  // Removing what is on screen (or sounding) stops it: the projector fades it
  // out (backgroundFadeMs) and the normal background returns.
  const mediaRemoved = useCallback((item: MediaItem) => {
    setAudioTrack((track) => (track?.id === item.id ? null : track));
    const current = liveRef.current;
    const showing = slideLive?.deckId === item.id
      || (current?.mode === "video" && item.file != null && current.video?.path === item.file);
    if (!showing) return;
    setSlideLive(null);
    void send(blankPayload(settings, settings.backgroundFadeMs));
  }, [slideLive, send, settings]);
  // Renaming the open item updates the header, the preview and the audio dock too.
  const mediaRenamed = useCallback((item: MediaItem) => {
    setMediaSelected((current) => (current?.id === item.id ? item : current));
    setSlideStaged((current) => (current?.deckId === item.id ? { ...current, title: item.title } : current));
    setAudioTrack((track) => (track?.id === item.id ? { ...track, title: item.title } : track));
  }, []);
  const selectSlide = useCallback((index: number) => {
    setSlideStaged((current) => {
      if (!current || current.images.length === 0) return current;
      const clamped = Math.min(Math.max(index, 0), current.images.length - 1);
      if (clamped === current.index) return current;
      const next = { ...current, index: clamped };
      if (projectOnClick) {
        const image = next.images[clamped] ?? null;
        // Defer the projection out of the state updater to avoid
        // double-sends under StrictMode double-invocation.
        queueMicrotask(() => {
          setSlideLive(next);
          void send(slidePayload(image));
        });
      }
      return next;
    });
  }, [projectOnClick, send, slidePayload]);
  const slidePreviewPayload = useMemo<ProjectorPayload | null>(() => {
    if (!slideStaged || slideStaged.images.length === 0) return null;
    const index = Math.min(Math.max(slideStaged.index, 0), slideStaged.images.length - 1);
    return slidePayload(slideStaged.images[index] ?? null);
  }, [slideStaged, slidePayload]);
  const projectSlideStaged = useCallback(async () => {
    if (!slideStaged || slideStaged.images.length === 0) return;
    const index = Math.min(Math.max(slideStaged.index, 0), slideStaged.images.length - 1);
    setSlideLive(slideStaged);
    await send(slidePayload(slideStaged.images[index] ?? null));
  }, [slideStaged, send, slidePayload]);
  const takeSlide = useCallback((index: number) => {
    if (!slideStaged) return;
    const image = slideStaged.images[index];
    if (image == null) return;
    const next = { ...slideStaged, index };
    setSlideStaged(next);
    setSlideLive(next);
    void send(slidePayload(image));
  }, [slideStaged, send, slidePayload]);
  const navigateSlidePreview = useCallback((delta: number) => { setSlideStaged((current) => current && current.images.length ? { ...current, index: Math.min(Math.max(current.index + delta, 0), current.images.length - 1) } : current); }, []);
  const navigateSlideLive = useCallback(async (delta: number) => {
    const current = slideLive;
    if (!current || current.images.length === 0) return;
    const index = Math.min(Math.max(current.index + delta, 0), current.images.length - 1);
    if (index === current.index) return;
    const next = { ...current, index };
    setSlideLive(next);
    await send(slidePayload(next.images[index] ?? null));
  }, [slideLive, send, slidePayload]);

  const selectedKind = mediaSelected ? mediaKind(mediaSelected) : null;
  const videoPreviewPayload = useMemo<ProjectorPayload | null>(() => {
    if (selectedKind !== "video" || !mediaSelected?.file) return null;
    // The preview shows the first frame; nothing plays until it is projected.
    return { ...slidePayload(null), mode: "video", video: { path: mediaSelected.file, playing: false, startedAt: 0, position: 0, volume: 0 } };
  }, [selectedKind, mediaSelected, slidePayload]);

  const projectVideo = useCallback(async (item: MediaItem) => {
    if (!item.file) return;
    setVideoTitle(item.title);
    setVideoDuration(null);
    await send({
      ...slidePayload(null),
      mode: "video",
      video: { path: item.file, playing: true, startedAt: Date.now(), position: 0, volume: videoVolume },
    });
  }, [send, slidePayload, videoVolume]);

  // Transport changes resend the payload that is on screen with a new clock.
  const updateVideo = useCallback((change: (video: VideoPlayback, now: number) => VideoPlayback) => {
    const current = liveRef.current;
    if (current?.mode !== "video" || !current.video) return;
    void send({ ...current, video: change(current.video, Date.now()) });
  }, [send]);

  const toggleVideo = useCallback(() => {
    updateVideo((video, now) => {
      const at = videoPosition(video, now, videoDuration);
      if (video.playing && !(videoDuration != null && at >= videoDuration - 0.25)) return { ...video, playing: false, position: at };
      // Play from where it was paused, or from the start once it has ended.
      const from = videoDuration != null && at >= videoDuration - 0.25 ? 0 : at;
      return { ...video, playing: true, position: from, startedAt: now - from * 1000 };
    });
  }, [updateVideo, videoDuration]);

  const seekVideo = useCallback((seconds: number) => {
    updateVideo((video, now) => ({ ...video, position: seconds, startedAt: now - seconds * 1000 }));
  }, [updateVideo]);

  const changeVideoVolume = useCallback((volume: number) => {
    setVideoVolume(volume);
    updateVideo((video) => ({ ...video, volume }));
  }, [updateVideo]);

  const playAudio = useCallback((item: MediaItem) => {
    if (item.file) setAudioTrack({ id: item.id, title: item.title, file: item.file });
  }, []);

  // "Proyectar" in Media: a slide goes to the screen, a video starts playing there, audio starts sounding here.
  const takeMedia = useCallback(() => {
    if (!mediaSelected) return;
    if (selectedKind === "video") void projectVideo(mediaSelected);
    else if (selectedKind === "audio") playAudio(mediaSelected);
    else void projectSlideStaged();
  }, [mediaSelected, selectedKind, projectVideo, playAudio, projectSlideStaged]);

  const showBlank = useCallback(async () => {
    // "Limpiar" clears only the text (verse/song/slide). Background color and
    // media stay so the projector keeps showing them behind empty content.
    // The blank transition uses the current workspace's fade setting.
    await send(blankPayload(settings, mode === "media" ? settings.backgroundFadeMs : mode === "canciones" ? settings.songFadeMs : settings.fadeMs));
  }, [send, settings, mode]);

  const toggleBlank = useCallback(async () => {
    if (live?.mode === "blank") {
      if (lastContent.current) await send(chrome(lastContent.current));
      return;
    }
    await showBlank();
  }, [live, send, chrome, showBlank]);

  // Fade used by the logo and countdown screens: the workspace on screen decides.
  const workspaceFadeMs = mode === "media" ? settings.backgroundFadeMs : mode === "canciones" ? settings.songFadeMs : settings.fadeMs;

  // Logo replaces the text; pressing it again brings back what was on screen.
  const toggleLogo = useCallback(async () => {
    if (live?.mode === "logo") {
      if (lastContent.current) await send(chrome(lastContent.current));
      else await showBlank();
      return;
    }
    await send({ ...blankPayload(settings, workspaceFadeMs), mode: "logo" });
  }, [live, send, chrome, settings, showBlank, workspaceFadeMs]);

  const startCountdown = useCallback(async (minutes: number) => {
    await send({
      ...blankPayload(settings, workspaceFadeMs),
      mode: "countdown",
      countdown: { caption: COUNTDOWN_CAPTION, endsAt: Date.now() + minutes * 60_000 },
    });
  }, [send, settings, workspaceFadeMs]);

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
          referenceColor: next.accentColor,
          versionColor: next.accentColor,
          // Style-only resync of the cleared screen: keep the fade it was
          // cleared with so the next content swap still uses its own timing.
          fadeMs: live.fadeMs ?? next.fadeMs,
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
        referenceColor: next.accentColor,
        versionColor: next.accentColor,
        fadeMs: live.fadeMs ?? next.fadeMs,
        backgroundFadeMs: next.backgroundFadeMs,
      });
    },
    [live, send],
  );

  const stageReference = useCallback((text: string): string | null => {
    const parsed = parseReference(text);
    if (!parsed.ok) return parsed.message;
    stageRange(parsed.range);
    return null;
  }, [stageRange]);

  const navigateVerse = useCallback(
    (delta: number) => {
      const ref = staged?.start;
      if (!ref) return;
      const bible = getBible(primaryId);
      if (!bible) return;
      let chapter = ref.chapter;
      let verse = ref.verse + delta;
      const book = ref.book;
      const maxInChapter = getChapterVerseCount(bible, book, chapter);
      // A row jump (↑ ↓) stays inside the chapter; single steps cross into the next one.
      if (Math.abs(delta) > 1) {
        verse = Math.min(Math.max(verse, 1), maxInChapter || 1);
        if (verse === ref.verse) return;
      }
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
    [staged, primaryId, stageRange],
  );

  const projectReference = useCallback(
    async (reference: string, id?: string) => {
      const parsed = parseReference(reference);
      if (!parsed.ok) return;
      stageRange(parsed.range);
      if (id) setActiveId(id);
      const content = fetchRangeTexts(
        primaryId,
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
        referenceColor: settings.accentColor,
        versionColor: settings.accentColor,
        backgroundImagePath: settings.backgroundImagePath,
        fadeMs: settings.fadeMs,
        backgroundFadeMs: settings.backgroundFadeMs,
      });
    },
    [stageRange, settings, primaryId, send],
  );

  const navigateLive = useCallback(
    async (delta: number) => {
      const base = liveRange ?? staged;
      const ref = base?.start;
      if (!ref) return;
      const bible = getBible(primaryId);
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
        primaryId,
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
        referenceColor: settings.accentColor,
        versionColor: settings.accentColor,
        backgroundImagePath: settings.backgroundImagePath,
        fadeMs: settings.fadeMs,
        backgroundFadeMs: settings.backgroundFadeMs,
      });
    },
    [liveRange, staged, settings, primaryId, send],
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

  // Arrows move the preview and Enter projects it, in every workspace.
  const stepPreview = useCallback((delta: number) => {
    if (mode === "canciones") navigateSongPreview(delta);
    else if (mode === "media") navigateSlidePreview(delta);
    else navigateVerse(delta);
  }, [mode, navigateSongPreview, navigateSlidePreview, navigateVerse]);

  const projectPreview = useCallback(() => {
    if (mode === "canciones") void projectSongStaged();
    else if (mode === "media") takeMedia();
    else void projectStaged();
  }, [mode, projectSongStaged, takeMedia, projectStaged]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("[data-search]")?.focus();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Open dialogs, sheets, menus and selects own the keyboard.
      if (document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]')) return;
      if (target instanceof HTMLElement && target.closest('[role="combobox"], [role="listbox"], [role="menu"]')) return;

      switch (e.key) {
        case "1":
        case "2":
        case "3":
          switchMode(MODE_ORDER[Number(e.key) - 1]);
          break;
        case "ArrowRight":
          e.preventDefault();
          stepPreview(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          stepPreview(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          stepPreview(gridColumns());
          break;
        case "ArrowUp":
          e.preventDefault();
          stepPreview(-gridColumns());
          break;
        case "Enter":
          // Other focused buttons (Limpiar, Guardar…) keep their own Enter.
          if (target instanceof HTMLElement && target.closest("button, a") && !target.closest(TAKE_ON_ENTER)) return;
          e.preventDefault();
          projectPreview();
          break;
        case "b":
        case "B":
          void toggleBlank();
          break;
        case "l":
        case "L":
          void toggleLogo();
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchMode, stepPreview, projectPreview, toggleBlank, toggleLogo]);

  const searchResults = useMemo(() => {
    if (!keyword.trim() || !ready) return [];
    return searchVerses(primaryId, keyword, 30);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, ready, primaryId, onlineBibles.chapterTick]);

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

  const goPrev = () => {
    if (queue.length === 0) return;
    const idx = queue.findIndex((q) => q.id === activeId);
    const prev = idx > 0 ? queue[idx - 1] : queue[queue.length - 1];
    if (!prev) return;
    void projectReference(prev.reference, prev.id);
  };

  // What each monitor is showing, next to its title.
  const songPartLabel = (stage: SongStage) => `${stage.title} · ${stage.labels[stage.index] || `Parte ${stage.index + 1}`}`;
  const previewLabel = mode === "canciones" ? (songStaged ? songPartLabel(songStaged) : "")
    : mode === "media" ? (slideStaged ? `${slideStaged.title} · ${slideStaged.index + 1}/${slideStaged.images.length}` : mediaSelected?.title ?? "")
    : staged ? formatRange(staged) : "";
  const liveLabel = !live || live.mode === "blank" ? "Fondo"
    : live.mode === "logo" ? "Logo"
    : live.mode === "countdown" ? "Cuenta regresiva"
    : live.mode === "video" ? videoTitle
    : live.mode === "slides" ? (slideLive ? `${slideLive.title} · ${slideLive.index + 1}/${slideLive.images.length}` : "Diapositiva")
    : live.referenceLabel ? live.referenceLabel.split(" — ")[0]
    : songLive ? songPartLabel(songLive) : "Canción";
  const previewPayloadForMode = mode === "canciones" ? songPreviewPayload
    : mode === "media" ? (selectedKind === "video" ? videoPreviewPayload : slidePreviewPayload)
    : previewPayload;
  const previewEmpty = mode === "canciones" ? "Elige una parte de la canción"
    : mode === "media" ? (selectedKind === "audio" ? "El audio suena en esta computadora" : "Elige una diapositiva o un video")
    : "Elige un versículo";
  // Previous / next under the live monitor follow what is on screen, not the workspace that is open.
  const stepLive = (delta: number) => {
    if (live?.mode === "slides") void navigateSlideLive(delta);
    else if (live?.mode === "verse" && !live.referenceLabel) void navigateSongLive(delta);
    else void navigateLive(delta);
  };

  if (loadError) {
    return (
      <div className="app-shell error-state">
        <h1>Error</h1>
        <p>{loadError}</p>
      </div>
    );
  }

  const versionControl = (
    <Select
      value={settings.primaryVersionId}
      items={allVersions.map((v) => ({ value: v.id, label: v.abbr }))}
      onValueChange={(value) => value && void applyChrome({ ...settings, primaryVersionId: value })}
    >
      <SelectTrigger className="lx-pill" aria-label="Versión de la Biblia" title="Versión"><SelectValue /></SelectTrigger>
      <SelectContent>
        {versions.filter((v) => !v.custom).map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.abbr}
          </SelectItem>
        ))}
        {versions.some((v) => v.custom) && (
          <SelectGroup>
            <SelectLabel>Mis biblias</SelectLabel>
            {versions.filter((v) => v.custom).map((v) => (
              <SelectItem key={v.id} value={v.id} data-testid={`version-${v.id}`}>
                {v.abbr}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {onlineBibles.online.versions.length > 0 && (
          <SelectGroup>
            <SelectLabel>En línea (YouVersion)</SelectLabel>
            {onlineBibles.online.versions.map((v) => (
              <SelectItem key={v.id} value={v.id} disabled={v.locked} title={v.lockedReason} data-testid={`version-${v.id}`}>
                {v.abbr}{v.locked ? " · requiere licencia" : ""}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );

  return (
    <div
      className="app-shell lx"
      data-mode={mode}
      style={{
        "--tile-bg": settings.backgroundColor,
        "--tile-fg": settings.theme === "light" ? "#1a1a1a" : "#f5f7fa",
      } as React.CSSProperties}
    >
      <header className="top-bar">
        <div className="top-left">
          <div className="brand">
            <img className="brand-logo" src={lumenLogo} alt="Lumen" />
          </div>
          <ModeSwitch mode={mode} onSwitch={switchMode} trailing={<UpdateButton />} />
        </div>
        <div className="top-right">
          <UpdateCheckButton />
          <Button type="button" variant="ghost" size="icon" className="shortcuts-btn" aria-label="Atajos de teclado" title="Atajos de teclado (?)" data-testid="btn-shortcuts" onClick={() => setShortcutsOpen(true)}>
            <Keyboard />
          </Button>
          {!window.__LUMEN_BROWSER__ && (
            <Button type="button" variant="outline" onClick={() => void window.proyector?.openProjector()}>
              Abrir proyector
            </Button>
          )}
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
          <WindowControls />
        </div>
      </header>

      {/* Library on the left, its content in the centre, preview and live on the right. */}
      <div className="lx-body">
        {mode === "canciones" ? (
          <SongsWorkspace
            staged={songStaged}
            selectedId={songSelectedId}
            liveText={live?.mode === "verse" && !live.referenceLabel ? live.blocks[0]?.text ?? null : null}
            liveIndex={songLive && songStaged && songLive.title === songStaged.title && songLive.slides[songLive.index] === songStaged.slides[songLive.index] ? songLive.index : null}
            projectOnClick={projectOnClick}
            onToggleProjectOnClick={setProjectOnClick}
            onSelectSong={selectSong}
            onSelectPart={selectSongPart}
            onTakePart={takeSongPart}
          />
        ) : mode === "media" ? (
          <MediaWorkspace
            staged={slideStaged}
            selected={mediaSelected}
            liveImage={live?.mode === "slides" ? live.slideImagePath ?? null : null}
            liveVideo={live?.mode === "video" ? live.video?.path ?? null : null}
            audioId={audioTrack?.id ?? null}
            audioPlaying={audioPlaying}
            slideFit={settings.slideFit}
            onSlideFit={(slideFit) => void applyChrome({ ...settings, slideFit })}
            projectOnClick={projectOnClick}
            onToggleProjectOnClick={setProjectOnClick}
            onSelect={selectMedia}
            onSelectSlide={selectSlide}
            onTakeSlide={takeSlide}
            onTake={takeMedia}
            onRemoved={mediaRemoved}
            onRenamed={mediaRenamed}
          />
        ) : (
          <BibleWorkspace
            versionId={primaryId}
            versionControl={versionControl}
            notice={onlineNotice}
            onRetryOnline={() => {
              onlineBibles.resetFailures();
              // Only re-ask for the list when it is what failed: it shares the
              // single request queue with the chapter that is being retried.
              if (onlineBibles.online.error || onlineBibles.online.stale || onlineBibles.online.versions.length === 0) {
                void onlineBibles.refreshVersions(true);
              }
            }}
            loadingChapter={!!onlineBibles.loading[onlineBibles.chapterKey({ versionId: primaryId, book: viewBook, chapter: viewChapter })]}
            ready={ready}
            viewBook={viewBook}
            viewChapter={viewChapter}
            staged={staged}
            liveRange={live?.mode === "verse" && live.referenceLabel ? liveRange : null}
            onOpenChapter={(book, chapter) => {
              setViewBook(book);
              setViewChapter(chapter);
              setKeyword("");
            }}
            onReference={stageReference}
            onAddCurrent={() => {
              if (!staged || queue.length >= MAX_QUEUE_ITEMS) return;
              void persistQueue([...queue, { id: newId(), reference: formatRange(staged) }]);
            }}
            savedCount={queue.length}
            onVerseClick={(verse, shiftKey) => {
              const next = rangeFromVerseClick(anchor, viewBook, viewChapter, verse, shiftKey);
              stageRange(next.range, next.anchor);
            }}
            onVerseTake={(verse) => void projectReference(formatRange({
              start: { book: viewBook, chapter: viewChapter, verse },
              end: { book: viewBook, chapter: viewChapter, verse },
            }))}
            keyword={keyword}
            onKeyword={setKeyword}
            searchResults={searchResults}
            onSearchPick={(hit) => {
              stageRange({
                start: { book: hit.book, chapter: hit.chapter, verse: hit.verse },
                end: { book: hit.book, chapter: hit.chapter, verse: hit.verse },
              });
              setKeyword("");
            }}
          />
        )}

        <aside className="lx-mon" aria-label="Monitores">
          <StageMonitor
            title="Vista previa"
            label={previewLabel}
            ratioLabel={projectorRatioLabel}
            payload={previewPayloadForMode}
            empty={previewEmpty}
            testId="preview-box"
            aspectRatio={projectorAspect}
            displayWidth={projectorBounds?.width}
            backgroundFit={settings.backgroundFit}
            slideFit={settings.slideFit}
          >
            <div className="lx-mon-actions">
              <button type="button" className="lx-take" data-testid="btn-project" onClick={projectPreview}>
                {mode === "media" && selectedKind === "audio" ? "Reproducir audio" : "Proyectar"} <kbd>↵</kbd>
              </button>
              <button type="button" className="lx-sq" aria-label="Anterior en la vista previa" title="Anterior (←)" onClick={() => stepPreview(-1)}>
                <ChevronLeft />
              </button>
              <button type="button" className="lx-sq" aria-label="Siguiente en la vista previa" title="Siguiente (→)" onClick={() => stepPreview(1)}>
                <ChevronRight />
              </button>
            </div>
          </StageMonitor>

          <StageMonitor
            title="En vivo"
            label={liveLabel}
            payload={live}
            testId="live-box"
            isLive
            liveSince={liveSince}
            aspectRatio={projectorAspect}
            displayWidth={projectorBounds?.width}
            backgroundFit={settings.backgroundFit}
            slideFit={settings.slideFit}
            onVideoDuration={setVideoDuration}
          >
            {live?.mode === "video" && live.video && (
              <VideoTransport video={live.video} duration={videoDuration} onToggle={toggleVideo} onSeek={seekVideo} onVolume={changeVideoVolume} />
            )}
            <div className="lx-mon-actions">
              <button
                type="button"
                className={live?.mode === "blank" && hasLiveContent ? "lx-act on" : "lx-act"}
                data-testid="btn-clear"
                title="Quitar el texto de la pantalla o devolverlo (B)"
                onClick={() => void toggleBlank()}
              >
                {live?.mode === "blank" && hasLiveContent ? "Restaurar" : "Limpiar"} <kbd>B</kbd>
              </button>
              <button
                type="button"
                className={live?.mode === "logo" ? "lx-act on" : "lx-act"}
                data-testid="btn-logo"
                aria-pressed={live?.mode === "logo"}
                title="Mostrar u ocultar el logo (L)"
                onClick={() => void toggleLogo()}
              >
                <Church /> Logo <kbd>L</kbd>
              </button>
              <button type="button" className="lx-sq" data-testid="btn-live-prev" aria-label="Anterior en vivo" title="Anterior, directo a la pantalla" onClick={() => stepLive(-1)}>
                <ChevronLeft />
              </button>
              <button type="button" className="lx-sq" data-testid="btn-live-next" aria-label="Siguiente en vivo" title="Siguiente, directo a la pantalla" onClick={() => stepLive(1)}>
                <ChevronRight />
              </button>
            </div>
            <div className="lx-mon-actions">
              <Select
                value={String(countdownMinutes)}
                items={COUNTDOWN_OPTIONS}
                onValueChange={(value) => value && setCountdownMinutes(Number(value))}
              >
                <SelectTrigger aria-label="Duración de la cuenta regresiva" data-testid="countdown-minutes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTDOWN_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                className={live?.mode === "countdown" ? "lx-act on" : "lx-act"}
                data-testid="btn-countdown"
                aria-pressed={live?.mode === "countdown"}
                onClick={() => void startCountdown(countdownMinutes)}
              >
                <Timer /> Cuenta regresiva
              </button>
            </div>
          </StageMonitor>

          <AudioDock track={audioTrack} onClose={() => setAudioTrack(null)} onPlayingChange={setAudioPlaying} />

          <section className="lx-panel stage-background">
            <span className="lx-h">Fondo</span>
            <div className="stage-background-row">
              <span className="background-color-wrap" title="Color de fondo">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="background-color-btn"
                  aria-label="Elegir color de fondo"
                >
                  <Palette />
                  <div
                    className="background-color-ring"
                    aria-hidden
                    style={{ borderColor: settings.backgroundColor }}
                  />
                </Button>
                <input
                  type="color"
                  className="background-color-input"
                  aria-label="Elegir color de fondo"
                  value={settings.backgroundColor}
                  onChange={(e) =>
                    void applyChrome({
                      ...settings,
                      backgroundColor: e.target.value,
                    })
                  }
                />
              </span>
              <Button
                type="button"
                className={!settings.backgroundImagePath ? "background-solid active" : "background-solid"}
                aria-pressed={!settings.backgroundImagePath}
                onClick={() => void applyChrome({ ...settings, backgroundImagePath: null })}
              >
                Color sólido
              </Button>
              {/* Colors (picker + solid) | media (add / delete / fit) */}
              <Separator orientation="vertical" className="stage-background-sep" />
              <Button
                type="button"
                disabled={backgroundImportBusy}
                onClick={async () => {
                  setBackgroundImportBusy(true);
                  try {
                    const path = await window.proyector?.pickBackgroundImage();
                    if (!path) return;
                    if (isBackgroundVideo(path)) await createBackgroundVideoThumbnail(path);
                    // New uploads join the library but never auto-project: the
                    // operator picks explicitly from the gallery.
                    if ((settings.backgroundImages ?? []).includes(path)) return;
                    await applyChrome({
                      ...settings,
                      backgroundImages: [...(settings.backgroundImages ?? []), path],
                    });
                  } finally {
                    setBackgroundImportBusy(false);
                  }
                }}
              >
                {backgroundImportBusy ? "Preparando…" : "Añadir fondo"}
              </Button>
              {(settings.backgroundImages ?? []).length > 0 && (
                <Button type="button" variant={deletingMedia ? "destructive" : "secondary"} onClick={() => setDeletingMedia((value) => !value)}>
                  {deletingMedia ? "Cancelar" : "Eliminar"}
                </Button>
              )}
              <FitToggle
                label="Fondo"
                testId="media-fit"
                value={settings.backgroundFit}
                onChange={(backgroundFit) => void applyChrome({ ...settings, backgroundFit })}
              />
            </div>
            {(settings.backgroundImages ?? []).length > 0 && (
              <div className="background-gallery" aria-label="Fondos guardados">
                {settings.backgroundImages.map((imagePath, index) => (
                  <div key={`${imagePath}-${index}`} className="background-choice-wrap">
                    <button type="button" className={`background-choice${settings.backgroundImagePath === imagePath ? " active" : ""}`} aria-label={deletingMedia ? `Eliminar fondo ${index + 1}` : `Usar fondo ${index + 1}`} aria-pressed={settings.backgroundImagePath === imagePath} onClick={() => { if (!deletingMedia) void applyChrome({ ...settings, backgroundImagePath: imagePath }); }}>
                      <BackgroundLibraryPreview filePath={imagePath} />
                    </button>
                    {deletingMedia && <AlertDialog>
                      <AlertDialogTrigger render={<Button type="button" variant="destructive" className="background-delete">Eliminar</Button>} />
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Eliminar fondo</AlertDialogTitle><AlertDialogDescription>¿Quieres eliminar este archivo de la biblioteca de fondos?</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void (async () => { await window.proyector?.deleteBackgroundMedia(imagePath); void applyChrome({ ...settings, backgroundImages: settings.backgroundImages.filter((item) => item !== imagePath), backgroundImagePath: settings.backgroundImagePath === imagePath ? null : settings.backgroundImagePath }); })()}>Eliminar</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="lx-panel lx-tweaks">
            <span className="lx-h">Pantalla</span>
            {mode !== "media" && <label className="tweak">
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
            </label>}
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
            {mode !== "media" && <label className="tweak">
              <span className="tweak-head">
                <span>Margen</span>
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
            </label>}
          </section>
        </aside>

        <SavedStrip
          queue={queue}
          activeId={activeId}
          history={history}
          onProject={(item) => {
            switchMode("biblia");
            void projectReference(item.reference, item.id);
          }}
          onRemove={(id) => void persistQueue(queue.filter((q) => q.id !== id))}
          onReorder={(from, to) => {
            if (from === to) return;
            if (from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
            const copy = [...queue];
            const [moved] = copy.splice(from, 1);
            if (!moved) return;
            copy.splice(to, 0, moved);
            void persistQueue(copy);
          }}
          onNext={() => {
            switchMode("biblia");
            goNext();
          }}
          onPrev={() => {
            switchMode("biblia");
            goPrev();
          }}
          onHistory={(reference) => {
            const parsed = parseReference(reference);
            if (!parsed.ok) return;
            switchMode("biblia");
            stageRange(parsed.range);
          }}
        />
      </div>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <Dialog open={overlay !== null} onOpenChange={(open) => !open && setOverlay(null)}>
        <DialogContent showCloseButton={false} className="overlay-dialog" data-testid={activeOverlay === "ajustes" ? "settings-panel" : undefined}>
          <DialogHeader className="overlay-dialog-header">
            <DialogTitle>{activeOverlay ? OVERLAY_TITLES[activeOverlay] : ""}</DialogTitle>
            <DialogClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar" />}>
              <X aria-hidden />
            </DialogClose>
          </DialogHeader>
          <div className="overlay-dialog-body">
            {activeOverlay === "ajustes" && <SettingsPanel settings={settings} versions={allVersions} onSave={(s) => applyChrome(s)} />}
            {activeOverlay === "biblias" && (
              <BiblesPanel
                customVersions={versions.filter((v) => v.custom)}
                online={onlineBibles.online}
                onRefreshOnline={() => void onlineBibles.refreshVersions(true)}
                onSearchOnline={(query) => onlineBibles.searchVersions(query)}
                onAddOnline={(id) => onlineBibles.addVersion(id)}
                onRemoveOnline={(id) => onlineBibles.removeVersion(id)}
                onChanged={(next) => {
                  if (next) setSettings(mergeSettings(next));
                  setLibraryTick((tick) => tick + 1);
                }}
              />
            )}
            {activeOverlay === "acerca" && <AboutModal />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
