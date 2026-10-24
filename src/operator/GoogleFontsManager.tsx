import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleFontSearchResult, InstalledFont } from "@shared/fonts";

interface Props {
  installed: InstalledFont[];
  /** Called after a font is removed, so a setting that used it can fall back. */
  onRemoved: (id: string) => void;
}

const SEARCH_DELAY_MS = 250;

export function GoogleFontsManager({ installed, onRemoved }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GoogleFontSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  // Family being installed, or id being removed. One job at a time keeps the list simple.
  const [busy, setBusy] = useState<string | null>(null);
  const latestSearch = useRef(0);

  // Empty query lists the most popular families. Late answers from an
  // older query are ignored.
  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    const search = ++latestSearch.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .searchGoogleFonts(query)
        .then((found) => {
          if (search !== latestSearch.current) return;
          setResults(found);
          setSearchError("");
        })
        .catch((error: unknown) => {
          if (search !== latestSearch.current) return;
          setResults([]);
          setSearchError(error instanceof Error ? error.message : "No se pudo buscar fuentes");
        })
        .finally(() => {
          if (search === latestSearch.current) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const install = async (family: string) => {
    setBusy(family);
    try {
      const font = await window.proyector!.installGoogleFont(family);
      toast.success(`${font.family} instalada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo instalar la fuente");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (font: InstalledFont) => {
    setBusy(font.id);
    try {
      await window.proyector!.removeInstalledFont(font.id);
      onRemoved(font.id);
      toast.success(`${font.family} quitada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo quitar la fuente");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="ajustes-row">
        <Input
          type="search"
          value={query}
          placeholder="Buscar, p. ej. Lora"
          aria-label="Buscar fuente en Google Fonts"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {searchError ? (
        <p className="ajustes-note ajustes-font-note">{searchError}</p>
      ) : (
        <ul className="ajustes-font-results" aria-busy={searching}>
          {results.map((font) => {
            const done = installed.some((item) => item.family === font.family);
            return (
              <li key={font.family}>
                <div className="ajustes-row-text">
                  <span>{font.family}</span>
                  <small>{[font.category, font.hebrew ? "hebreo" : ""].filter(Boolean).join(" · ")}</small>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={done || busy !== null}
                  onClick={() => void install(font.family)}
                >
                  {done ? "Instalada" : busy === font.family ? "Instalando…" : "Instalar"}
                </Button>
              </li>
            );
          })}
          {!searching && results.length === 0 && <li className="ajustes-note">Sin resultados</li>}
        </ul>
      )}

      {installed.map((font) => (
        <div className="ajustes-row" key={font.id}>
          <div className="ajustes-row-text">
            <span>{font.family}</span>
            <small>{font.category}</small>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void remove(font)}
          >
            Quitar
          </Button>
        </div>
      ))}

      <p className="ajustes-note ajustes-font-note">
        Fuentes de Google Fonts, de uso libre. Instalar necesita internet; después funcionan sin conexión.
      </p>
    </>
  );
}
