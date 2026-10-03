import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, HistoryEntry, ProjectorPayload, QueueEntry, VerseRange } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import { useBibleLoader } from "../hooks/useBibleLoader";
import { parseReference, formatRange, type VerseRef } from "@shared/reference";
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
import { AboutModal } from "./AboutModal";
import { BiblesPanel } from "./BiblesPanel";
import { SettingsPanel } from "./SettingsPanel";
import { StageMonitor } from "./StageMonitor";
import { ChapterReader } from "./ChapterReader";
import { ServiceRundown } from "./ServiceRundown";
import lumenLogo from "../../logo-dark.png";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mergeSettings(s: AppSettings): AppSettings {
  return { ...DEFAULT_SETTINGS, ...s };
}

export function OperatorApp() {
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
  const [overlay, setOverlay] = useState<"ajustes" | "acerca" | "biblias" | null>(null);
  const [libraryTick, setLibraryTick] = useState(0);
  const lastVerse = useRef<ProjectorPayload | null>(null);
  const booted = useRef(false);

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
    if (!staged || !ready) return null;
    return fetchRangeTexts(
      settings.primaryVersionId,
      settings.dualView ? settings.secondaryVersionId : null,
      staged,
    );
  }, [staged, ready, settings.primaryVersionId, settings.dualView, settings.secondaryVersionId]);

  const previewPayload = useMemo<ProjectorPayload | null>(() => {
    if (!previewContent) return null;
    return {
      mode: "verse",
      referenceLabel: previewContent.referenceLabel,
      blocks: previewContent.blocks,
      churchName: settings.churchName,
      fontSize: settings.fontSize,
      brightness: settings.brightness,
      theme: settings.theme,
      backgroundColor: settings.backgroundColor,
      copyright: projectionCopyright(
        settings.primaryVersionId,
        settings.dualView ? settings.secondaryVersionId : null,
        settings.showCopyright,
      ),
    };
  }, [previewContent, settings]);

  const chrome = useCallback(
    (base: ProjectorPayload): ProjectorPayload => ({
      ...base,
      churchName: settings.churchName,
      fontSize: settings.fontSize,
      brightness: settings.brightness,
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
    }),
    [settings],
  );

  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    void api.getSettings().then((s) => setSettings(mergeSettings(s)));
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

  useEffect(() => {
    if (!ready || booted.current) return;
    booted.current = true;
    const parsed = parseReference("Juan 3:16");
    if (parsed.ok) stageRange(parsed.range);
  }, [ready, stageRange]);

  const send = useCallback(async (payload: ProjectorPayload) => {
    setLive(payload);
    if (payload.mode === "verse") lastVerse.current = payload;
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

  const showBlank = useCallback(async () => {
    await send({
      mode: "blank",
      referenceLabel: "",
      blocks: [],
      churchName: settings.churchName,
      fontSize: settings.fontSize,
      brightness: settings.brightness,
      theme: settings.theme,
      backgroundColor: "#000000",
      copyright: "",
    });
  }, [send, settings]);

  const showLogo = useCallback(async () => {
    if (live?.mode === "logo") {
      if (lastVerse.current) await send(chrome(lastVerse.current));
      else await showBlank();
      return;
    }
    await send({
      mode: "logo",
      referenceLabel: "",
      blocks: [],
      churchName: settings.churchName,
      fontSize: settings.fontSize,
      brightness: settings.brightness,
      theme: settings.theme,
      backgroundColor: settings.backgroundColor,
      copyright: "",
    });
  }, [live, send, chrome, showBlank, settings]);

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
      if (!live || live.mode === "blank") return;
      await send({
        ...live,
        churchName: next.churchName,
        fontSize: next.fontSize,
        brightness: next.brightness,
        theme: next.theme,
        backgroundColor: next.backgroundColor,
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
        theme: settings.theme,
        backgroundColor: settings.backgroundColor,
        copyright: projectionCopyright(
          settings.primaryVersionId,
          settings.dualView ? settings.secondaryVersionId : null,
          settings.showCopyright,
        ),
      });
    },
    [stageRange, settings, send],
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
      } else if (e.key === "Escape" || e.key === "b" || e.key === "B") {
        e.preventDefault();
        void toggleBlank();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigateVerse, projectStaged, resolveFromInput, toggleBlank]);

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
        <div className="brand">
          <img className="brand-logo" src={lumenLogo} alt="" aria-hidden />
          <h1>Lumen</h1>
        </div>
        <label className="version-select">
          Versión
          <select
            value={settings.primaryVersionId}
            onChange={(e) => void applyChrome({ ...settings, primaryVersionId: e.target.value })}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.abbr}
              </option>
            ))}
          </select>
        </label>
        <label className="mini-slider">
          Fuente
          <Input
            type="range"
            min={40}
            max={110}
            value={settings.fontSize}
            onChange={(e) => void applyChrome({ ...settings, fontSize: parseInt(e.target.value, 10) })}
          />
        </label>
        <label className="mini-slider">
          Luz
          <Input
            type="range"
            min={35}
            max={100}
            value={Math.round(settings.brightness * 100)}
            onChange={(e) =>
              void applyChrome({ ...settings, brightness: parseInt(e.target.value, 10) / 100 })
            }
          />
        </label>
        <div className="tabs">
          <Button type="button" onClick={() => void toggleBlank()}>
            {live?.mode === "blank" ? "Quitar negro" : "Negro"}
          </Button>
          <Button type="button" onClick={() => void showLogo()}>
            Logo
          </Button>
          <Button type="button" data-testid="tab-buscar" onClick={() => setOverlay(null)}>
            Culto
          </Button>
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
      </header>

      <div className="workspace">
        <ChapterReader
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
        />

        <section className="stage-col">
          {!ready && <p className="muted">Cargando textos bíblicos…</p>}
          <div className="monitors">
            <StageMonitor
              title="Vista previa"
              payload={previewPayload}
              empty="Elija un versículo"
              testId="preview-box"
            />
            <StageMonitor
              title="En vivo"
              payload={live}
              empty="Todavía no se proyecta"
              testId="live-box"
            />
          </div>
          <div className="action-row">
            <Button type="button" className="primary" data-testid="btn-project" onClick={() => void projectStaged()}>
              Proyectar
            </Button>
            <Button type="button" onClick={() => navigateVerse(-1)}>
              ◀ Anterior
            </Button>
            <Button type="button" onClick={() => navigateVerse(1)}>
              Siguiente ▶
            </Button>
          </div>
          <p className="hint">
            Las flechas solo cambian la vista previa. Enter proyecta. Esc o B pone la pantalla en negro.
          </p>
        </section>

        <ServiceRundown
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
        />
      </div>

      {overlay === "ajustes" && (
        <div className="overlay" data-testid="settings-panel">
          <SettingsPanel settings={settings} versions={versions} onSave={applyChrome} />
        </div>
      )}
      {overlay === "biblias" && (
        <div className="overlay wide">
          <BiblesPanel
            onChanged={(next) => {
              if (next) setSettings(mergeSettings(next));
              setLibraryTick((tick) => tick + 1);
            }}
          />
        </div>
      )}
      {overlay === "acerca" && (
        <div className="overlay wide">
          <AboutModal />
        </div>
      )}
    </div>
  );
}
