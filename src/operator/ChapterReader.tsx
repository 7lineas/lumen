import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { BOOKS } from "@shared/books";
import type { VerseRange } from "@shared/reference";
import { getBible } from "@shared/bible-service";

interface SearchHit {
  book: string;
  chapter: number;
  verse: number;
  snippet: string;
}

interface Props {
  versionId: string;
  ready: boolean;
  viewBook: string;
  viewChapter: number;
  staged: VerseRange | null;
  liveKey: string | null;
  bookFilter: string;
  onBookFilter: (value: string) => void;
  onSelectBook: (code: string) => void;
  onSelectChapter: (chapter: number) => void;
  onVerseClick: (verse: number, shiftKey: boolean) => void;
  onVerseDoubleClick: (verse: number) => void;
  refInput: string;
  onRefInput: (value: string) => void;
  onRefSubmit: () => void;
  parseError: string | null;
  keyword: string;
  onKeyword: (value: string) => void;
  searchResults: SearchHit[];
  onSearchPick: (hit: SearchHit) => void;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function ChapterReader(props: Props) {
  const [showText, setShowText] = useState(false);
  const book = BOOKS.find((b) => b.code === props.viewBook);
  const bible = props.ready ? getBible(props.versionId) : undefined;
  const chapterMap = bible?.verses[props.viewBook]?.[String(props.viewChapter)];
  const verses = chapterMap
    ? Object.keys(chapterMap)
        .map((v) => parseInt(v, 10))
        .sort((a, b) => a - b)
    : [];

  const q = normalize(props.bookFilter.trim());
  const visibleBooks = BOOKS.filter((b) => !q || normalize(b.name).includes(q) || b.code.toLowerCase().includes(q));
  const ot = visibleBooks.filter((b) => b.testament === "OT");
  const nt = visibleBooks.filter((b) => b.testament === "NT");

  const stagedHere =
    props.staged &&
    props.staged.start.book === props.viewBook &&
    props.staged.start.chapter === props.viewChapter
      ? props.staged
      : null;

  useEffect(() => {
    document.querySelector(".verse-row.in-range")?.scrollIntoView({ block: "nearest" });
  }, [props.viewBook, props.viewChapter, stagedHere?.start.verse, stagedHere?.end.verse]);

  return (
    <section className="reader">
      <div className="ref-row">
        <Input
          data-role="ref"
          data-testid="ref-input"
          value={props.refInput}
          onChange={(e) => props.onRefInput(e.target.value)}
          onBlur={props.onRefSubmit}
          placeholder="jn 3:16, salmo 23, 1 cor 13:4-7"
          aria-label="Referencia"
        />
        <Button type="button" onClick={props.onRefSubmit}>
          Ir
        </Button>
      </div>
      {props.parseError && <p className="field-error">{props.parseError}</p>}

      <Input
        value={props.bookFilter}
        onChange={(e) => props.onBookFilter(e.target.value)}
        placeholder="Filtrar libros"
        aria-label="Filtrar libros"
      />

      <div className="book-cols">
        <div>
          <p className="col-label">Antiguo</p>
          {ot.map((b) => (
            <Button
              key={b.code}
              type="button"
              className={b.code === props.viewBook ? "book-btn selected" : "book-btn"}
              onClick={() => props.onSelectBook(b.code)}
            >
              {b.name}
            </Button>
          ))}
        </div>
        <div>
          <p className="col-label">Nuevo</p>
          {nt.map((b) => (
            <Button
              key={b.code}
              type="button"
              className={b.code === props.viewBook ? "book-btn selected" : "book-btn"}
              onClick={() => props.onSelectBook(b.code)}
            >
              {b.name}
            </Button>
          ))}
        </div>
      </div>

      <p className="section-label">
        {book ? book.name : "Libro"} · capítulo
      </p>
      <div className="chapter-grid">
        {Array.from({ length: book?.chapters ?? 0 }, (_, i) => i + 1).map((c) => (
          <Button
            key={c}
            type="button"
            className={c === props.viewChapter ? "chip selected" : "chip"}
            onClick={() => props.onSelectChapter(c)}
          >
            {c}
          </Button>
        ))}
      </div>

      <div className="verse-head">
        <p className="section-label">Versículos</p>
        <Button
          type="button"
          className={showText ? "chip selected" : "chip"}
          aria-pressed={showText}
          onClick={() => setShowText((v) => !v)}
        >
          Texto
        </Button>
      </div>

      {showText ? (
      <ol className="verse-list">
        {verses.map((v) => {
          const inRange =
            stagedHere != null && v >= stagedHere.start.verse && v <= stagedHere.end.verse;
          const text = chapterMap?.[String(v)] ?? "";
          const key = `${props.viewBook}:${props.viewChapter}:${v}`;
          return (
            <li key={v}>
              <Button
                type="button"
                className={`verse-row${inRange ? " in-range" : ""}${props.liveKey === key ? " is-live" : ""}`}
                data-verse-active={inRange ? "1" : undefined}
                onClick={(e) => props.onVerseClick(v, e.shiftKey)}
                onDoubleClick={() => props.onVerseDoubleClick(v)}
              >
                <span className="verse-num">{v}</span>
                <span>{text}</span>
              </Button>
            </li>
          );
        })}
      </ol>
      ) : (
      <div className="chapter-grid">
        {verses.map((v) => {
          const inRange =
            stagedHere != null && v >= stagedHere.start.verse && v <= stagedHere.end.verse;
          return (
            <Button
              key={v}
              type="button"
              className={inRange ? "chip selected" : "chip"}
              data-verse-active={inRange ? "1" : undefined}
              onClick={(e) => props.onVerseClick(v, e.shiftKey)}
              onDoubleClick={() => props.onVerseDoubleClick(v)}
            >
              {v}
            </Button>
          );
        })}
      </div>
      )}

      <p className="section-label">Buscar palabra</p>
      <Input
        data-testid="keyword-input"
        value={props.keyword}
        onChange={(e) => props.onKeyword(e.target.value)}
        placeholder="amor, paz, gracia…"
        aria-label="Buscar palabra"
      />
      {props.searchResults.length > 0 && (
        <ul className="search-results">
          {props.searchResults.map((r) => (
            <li key={`${r.book}-${r.chapter}-${r.verse}`}>
              <Button type="button" onClick={() => props.onSearchPick(r)}>
                {r.snippet}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Clic prepara el versículo. Mayús+clic marca un rango. Doble clic lo proyecta.</p>
    </section>
  );
}
