import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, CircleAlert, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fontStack,
  type FontFamilyId,
  type GoogleFontSearchResult,
  type InstalledFont,
} from "@shared/fonts";
import { useFontPreview } from "@/hooks/useFontPreview";

interface Props {
  /** Typeface currently saved, so its row shows a check mark. */
  value: FontFamilyId;
  installed: InstalledFont[];
  /** Called with the picked font once it is installed (if needed). */
  onSelect: (id: FontFamilyId) => void;
  /** Called after a font is removed, so a setting that used it can fall back. */
  onRemoved: (id: string) => void;
}

const SEARCH_DELAY_MS = 250;

/** Family name drawn in its own typeface, so a font can be seen before it is installed. */
function FontPreviewName({ family }: { family: string }) {
  const stack = useFontPreview(family);
  return (
    <span style={stack ? { fontFamily: stack } : undefined}>{family}</span>
  );
}

/** Search icon next to the typeface selector. Opens a search list of installed and Google fonts. */
export function GoogleFontsCombobox({
  value,
  installed,
  onSelect,
  onRemoved,
}: Props) {
  const [open, setOpen] = useState(false);
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
    if (!open || !api) return;
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
          setSearchError(
            error instanceof Error
              ? error.message
              : "No se pudo buscar fuentes",
          );
        })
        .finally(() => {
          if (search === latestSearch.current) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const needle = query.trim().toLowerCase();
  const installedMatches = installed.filter((font) =>
    font.family.toLowerCase().includes(needle),
  );
  const installedFamilies = new Set(installed.map((font) => font.family));
  // Installed fonts come from the local list, so they still show when offline.
  const catalogMatches = results.filter(
    (font) => !installedFamilies.has(font.family),
  );

  const select = (id: string) => {
    onSelect(id as FontFamilyId);
    setOpen(false);
  };

  const choose = async (family: string) => {
    const existing = installed.find((font) => font.family === family);
    if (existing) return select(existing.id);
    setBusy(family);
    try {
      const font = await window.proyector!.installGoogleFont(family);
      toast.success(`${font.family} instalada`);
      select(font.id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo instalar la fuente",
      );
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
      toast.error(
        error instanceof Error ? error.message : "No se pudo quitar la fuente",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Buscar fuente de Google"
          />
        }
      >
        <Search size={15} strokeWidth={2} aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="ajustes-font-popover">
        <InputGroup>
          <InputGroupInput
            type="search"
            autoFocus
            value={query}
            placeholder="Buscar, p. ej. Lora"
            aria-label="Buscar fuente"
            onChange={(event) => setQuery(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Información sobre las fuentes de Google"
                  />
                }
              >
                <CircleAlert aria-hidden />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                Fuentes de Google Fonts, de uso libre. Instalar necesita
                internet; después funcionan sin conexión.
              </TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>

        <ul className="ajustes-font-list" aria-busy={searching}>
          {installedMatches.map((font) => (
            <li key={font.id} className="ajustes-font-item">
              <button
                type="button"
                className="ajustes-font-pick"
                disabled={busy !== null}
                onClick={() => select(font.id)}
              >
                <span style={{ fontFamily: fontStack(font.id) }}>
                  {font.family}
                </span>
                <small>{font.category}</small>
              </button>
              {font.id === value && (
                <Check size={14} strokeWidth={2} aria-label="Seleccionada" />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Quitar ${font.family}`}
                disabled={busy !== null}
                onClick={() => void remove(font)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}

          {!searchError &&
            catalogMatches.map((font) => (
              <li key={font.family} className="ajustes-font-item">
                <button
                  type="button"
                  className="ajustes-font-pick"
                  disabled={busy !== null}
                  onClick={() => void choose(font.family)}
                >
                  <FontPreviewName family={font.family} />
                  <small>
                    {[font.category, font.hebrew ? "hebreo" : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </button>
                <span className="ajustes-font-action">
                  {busy === font.family ? "Instalando…" : "Instalar"}
                </span>
              </li>
            ))}

          {searchError && (
            <li className="ajustes-note ajustes-font-note">{searchError}</li>
          )}
          {!searching &&
            !searchError &&
            installedMatches.length === 0 &&
            catalogMatches.length === 0 && (
              <li className="ajustes-note ajustes-font-note">Sin resultados</li>
            )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
