import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { BOOKS } from "@shared/books";
import { filterBooks } from "@shared/book-filter";
import { MAX_QUEUE_ITEMS } from "@shared/types";
import { formatRange, type VerseRange } from "@shared/reference";
import { getBible } from "@shared/bible-service";
import { SearchIcon } from "./icons";
import { SlideTile } from "./SlideTile";

interface SearchHit {
  book: string;
  chapter: number;
  verse: number;
  snippet: string;
}

interface Props {
  versionId: string;
  /** Version picker shown in the library head. */
  versionControl: ReactNode;
  ready: boolean;
  viewBook: string;
  viewChapter: number;
  staged: VerseRange | null;
  /** Verses on the projector right now. */
  liveRange: VerseRange | null;
  onOpenChapter: (book: string, chapter: number) => void;
  /** Stage a typed reference ("jn 3:16"). Returns the error to show, or null when it worked. */
  onReference: (text: string) => string | null;
  onVerseClick: (verse: number, shiftKey: boolean) => void;
  /** Double-click: stage the verse and project it. */
  onVerseTake: (verse: number) => void;
  onAddCurrent: () => void;
  /** References already stored in the rundown; caps how many can be added. */
  savedCount: number;
  /** Online Bible status (offline / license / rate limit) shown above the list. */
  notice?: string | null;
  onRetryOnline?: () => void;
  loadingChapter?: boolean;
  keyword: string;
  onKeyword: (value: string) => void;
  searchResults: SearchHit[];
  onSearchPick: (hit: SearchHit) => void;
}

/** Above this many matching books the chapter lists stay closed until one is opened. */
const AUTO_OPEN_LIMIT = 6;

export function BibleWorkspace(props: Props) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Book whose chapters are open while browsing; follows the chapter on screen.
  const [expanded, setExpanded] = useState<string | null>(props.viewBook);
  const listRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const book = BOOKS.find((b) => b.code === props.viewBook);
  const bible = props.ready ? getBible(props.versionId) : undefined;
  const chapterMap = bible?.verses[props.viewBook]?.[String(props.viewChapter)];
  const verses = useMemo(
    () => (chapterMap ? Object.keys(chapterMap).map((v) => parseInt(v, 10)).sort((a, b) => a - b) : []),
    [chapterMap],
  );

  const filtering = query.trim() !== "";
  const filter = useMemo(() => filterBooks(query, props.viewBook), [query, props.viewBook]);
  const openAll = filtering && (filter.hasChapter || filter.matches.length <= AUTO_OPEN_LIMIT);

  const stagedHere =
    props.staged && props.staged.start.book === props.viewBook && props.staged.start.chapter === props.viewChapter
      ? props.staged
      : null;
  const liveHere =
    props.liveRange && props.liveRange.start.book === props.viewBook && props.liveRange.start.chapter === props.viewChapter
      ? props.liveRange
      : null;
  const chapterCount = book?.chapters ?? 0;
  const saveFull = props.savedCount >= MAX_QUEUE_ITEMS;
  const searching = props.keyword.trim() !== "";

  useEffect(() => {
    setExpanded(props.viewBook);
  }, [props.viewBook]);

  // Keep the open chapter in view in the library, and the staged verse in the grid.
  useEffect(() => {
    if (filtering) return;
    listRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest" });
  }, [props.viewBook, props.viewChapter, expanded, filtering]);

  useEffect(() => {
    gridRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest" });
  }, [props.viewBook, props.viewChapter, stagedHere?.start.verse, stagedHere?.end.verse, verses.length]);

  // Opening a chapter ends the search: the list goes back to every book, open on this one.
  const openChapter = (code: string, chapter: number) => {
    setError(null);
    setQuery("");
    setExpanded(code);
    props.onOpenChapter(code, chapter);
  };

  const submit = () => {
    const text = query.trim();
    if (!text) return;
    // With a verse ("jn 3:16") it is a reference; otherwise the first match opens.
    if (text.includes(":")) {
      const failure = props.onReference(text);
      setError(failure);
      if (!failure) setQuery("");
      return;
    }
    const first = filter.matches[0];
    if (!first) return;
    openChapter(first.book.code, first.chapters[0] ?? 1);
  };

  return (
    <>
      <aside className="lx-lib">
        <div className="lx-lib-head">
          <span className="lx-h">Escritura</span>
          {props.versionControl}
        </div>
        <label className="lx-search">
          <SearchIcon />
          <input
            data-search
            data-testid="ref-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Libro y capítulo… juan 3"
            aria-label="Buscar libro y capítulo"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {error && <p className="lx-note lx-note-error" role="alert">{error}</p>}
        {props.notice && (
          <p className="lx-note" role="status" data-testid="online-notice">
            {props.notice}{" "}
            {props.onRetryOnline && <button type="button" className="lx-link" onClick={props.onRetryOnline}>Reintentar en línea</button>}
          </p>
        )}
        <div className="lx-lib-scroll" ref={listRef}>
          {filter.matches.length === 0 && <p className="lx-empty">Nada coincide con “{query.trim()}”.</p>}
          {filter.matches.map(({ book: b, chapters }) => {
            const open = openAll || expanded === b.code;
            const viewing = b.code === props.viewBook;
            return (
              <div key={b.code} className={`lx-book${viewing ? " viewing" : ""}`}>
                <button
                  type="button"
                  className="lx-book-name"
                  aria-expanded={open}
                  onClick={() => setExpanded(expanded === b.code ? null : b.code)}
                >
                  <span>{b.name}</span>
                  <small>{b.chapters}</small>
                </button>
                {open && (
                  <div className="lx-chaps">
                    {chapters.map((c) => {
                      const on = viewing && c === props.viewChapter;
                      return (
                        <button
                          key={c}
                          type="button"
                          className={on ? "on" : undefined}
                          data-current={on ? "" : undefined}
                          aria-label={`${b.name} ${c}`}
                          onClick={() => openChapter(b.code, c)}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <main className="lx-work">
        <div className="lx-ws-head">
          <div className="lx-ws-heading">
            <div className="lx-ws-title">{book?.name ?? "Libro"} {props.viewChapter}</div>
            <div className="lx-ws-sub">
              {bible?.meta.name ?? props.versionId}
              {verses.length > 0 && ` · ${verses.length} ${verses.length === 1 ? "versículo" : "versículos"}`}
            </div>
          </div>
          <div className="lx-ws-tools">
            <div className="lx-seg" role="group" aria-label="Cambiar de capítulo">
              <button type="button" aria-label="Capítulo anterior" disabled={props.viewChapter <= 1} onClick={() => openChapter(props.viewBook, props.viewChapter - 1)}>
                <ChevronLeft />
              </button>
              <button type="button" aria-label="Capítulo siguiente" disabled={props.viewChapter >= chapterCount} onClick={() => openChapter(props.viewBook, props.viewChapter + 1)}>
                <ChevronRight />
              </button>
            </div>
            <label className="lx-search lx-search-inline">
              <SearchIcon />
              <input
                data-testid="keyword-input"
                value={props.keyword}
                onChange={(e) => props.onKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    props.onKeyword("");
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Buscar palabra… gracia"
                aria-label="Buscar palabra en la Biblia"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="lx-btn"
              disabled={!props.staged || saveFull}
              title={saveFull ? `Máximo de ${MAX_QUEUE_ITEMS} guardados` : props.staged ? `Guardar ${formatRange(props.staged)}` : "Elige un versículo para guardarlo"}
              onClick={props.onAddCurrent}
            >
              <Save /> Guardar
            </button>
          </div>
        </div>

        {searching ? (
          <div className="lx-results">
            {props.searchResults.length === 0 ? (
              <p className="lx-empty-ws">Sin resultados para “{props.keyword.trim()}”.</p>
            ) : (
              <ul>
                {props.searchResults.map((r) => {
                  const cut = r.snippet.indexOf(" — ");
                  const picked =
                    props.staged != null &&
                    props.staged.start.book === r.book &&
                    props.staged.start.chapter === r.chapter &&
                    props.staged.start.verse === r.verse;
                  return (
                    <li key={`${r.book}-${r.chapter}-${r.verse}`}>
                      <button type="button" className={picked ? "lx-result on" : "lx-result"} onClick={() => props.onSearchPick(r)}>
                        <strong>{cut < 0 ? r.snippet : r.snippet.slice(0, cut)}</strong>
                        {cut >= 0 && <span>{r.snippet.slice(cut + 3)}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : verses.length === 0 ? (
          <p className="lx-empty-ws">
            {props.loadingChapter || !props.ready ? "Cargando capítulo…" : "Este capítulo no está disponible en esta versión."}
          </p>
        ) : (
          <div className="lx-slides" ref={gridRef}>
            {verses.map((v) => {
              const inRange = stagedHere != null && v >= stagedHere.start.verse && v <= stagedHere.end.verse;
              const isLive = liveHere != null && v >= liveHere.start.verse && v <= liveHere.end.verse;
              return (
                <button
                  key={v}
                  type="button"
                  className={`lx-card${inRange ? " sel" : ""}${isLive ? " live" : ""}`}
                  data-verse-active={inRange ? "1" : undefined}
                  data-current={inRange ? "" : undefined}
                  title="Clic prepara el versículo, Mayús+clic marca un rango, doble clic lo proyecta"
                  onClick={(e) => props.onVerseClick(v, e.shiftKey)}
                  onDoubleClick={() => props.onVerseTake(v)}
                >
                  <SlideTile text={chapterMap?.[String(v)] ?? ""} />
                  <span className="lx-tag-live">En vivo</span>
                  <span className="lx-card-foot">
                    <span className="num">{v}</span>
                    <span className="lab">{book?.name} {props.viewChapter}:{v}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
