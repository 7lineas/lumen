import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportMetaErrors } from "@shared/bible-import/build";
import type { ImportPreview } from "@shared/bible-import/types";
import type { BibleVersionMeta } from "@shared/types";

interface Props {
  customVersions: BibleVersionMeta[];
  onChanged: () => void;
  onRemove: (id: string) => Promise<void>;
}

const NUMBER = new Intl.NumberFormat("es-CO");

export function ImportBibleCard({ customVersions, onChanged, onRemove }: Props) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState({ name: "", abbr: "", language: "es", copyright: "" });
  const [fieldErrors, setFieldErrors] = useState<ImportMetaErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    setDone(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const result = await window.proyector?.pickBibleImport();
      if (!result || (!result.ok && result.canceled)) return;
      if (!result.ok) {
        setPreview(null);
        setError(result.error ?? "No se pudo leer el archivo");
        return;
      }
      setPreview(result.preview);
      const hint = result.preview.hint;
      setFields({
        name: hint.name ?? "",
        abbr: hint.abbr ?? "",
        language: hint.language && /^[a-z]{2,3}$/.test(hint.language) ? hint.language : "es",
        copyright: hint.copyright ?? "",
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir el archivo");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.proyector?.commitBibleImport(preview.previewId, fields);
      if (!result) return;
      if (!result.ok) {
        setFieldErrors(result.errors);
        if (result.error) setError(result.error);
        return;
      }
      setDone(`«${result.version.name}» (${result.version.abbr}) se importó. Está en el selector de versión, grupo «Mis biblias».`);
      setPreview(null);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo importar");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setPreview(null);
    setFieldErrors({});
    setError(null);
    await window.proyector?.cancelBibleImport();
  }

  async function remove(id: string) {
    setRowError(null);
    try {
      await onRemove(id);
    } catch (reason) {
      setRowError(reason instanceof Error ? reason.message : "No se pudo quitar");
    }
  }

  const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setFields({ ...fields, [key]: event.target.value });

  return (
    <section data-testid="import-bible">
      <h2>Mis biblias</h2>
      <p>
        Importe su propia versión desde un archivo: JSON de Lumen, Zefania XML, OSIS XML, USFM, CSV o TSV. Se guarda en este
        equipo y funciona sin internet. Usted es responsable de tener permiso para usar el texto; el copyright que escriba
        aparece en el pie de la proyección.
      </p>
      {!preview && (
        <Button type="button" className="primary" data-testid="import-bible-button" onClick={() => void pick()} disabled={busy}>
          Importar Biblia…
        </Button>
      )}
      {done && <p className="muted" data-testid="import-done">{done}</p>}
      {error && <p className="error" data-testid="import-error" style={{ whiteSpace: "pre-line" }}>{error}</p>}

      {preview && (
        <article className="bible-row" data-testid="import-preview">
          <h3>Vista previa · {preview.summary.formatLabel}</h3>
          <p className="bible-meta" data-testid="import-counts">
            {preview.fileNames.join(", ")} · {preview.summary.bookCount} libros · {NUMBER.format(preview.summary.chapterCount)} capítulos ·{" "}
            {NUMBER.format(preview.summary.verseCount)} versículos
          </p>
          {preview.summary.warnings.map((warning) => (
            <p className="bible-banner" key={warning}>{warning}</p>
          ))}

          <label className="field">
            <span>Nombre</span>
            <Input value={fields.name} onChange={set("name")} placeholder="Mi Biblia de estudio" aria-label="Nombre" aria-invalid={!!fieldErrors.name} data-testid="import-name" />
            {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
          </label>
          <label className="field">
            <span>Abreviatura (aparece en el selector y en la proyección)</span>
            <Input value={fields.abbr} onChange={set("abbr")} placeholder="MBE" maxLength={12} aria-label="Abreviatura" aria-invalid={!!fieldErrors.abbr} data-testid="import-abbr" />
            {fieldErrors.abbr && <span className="field-error">{fieldErrors.abbr}</span>}
          </label>
          <label className="field">
            <span>Idioma (código)</span>
            <Input value={fields.language} onChange={set("language")} placeholder="es" maxLength={8} aria-label="Idioma" aria-invalid={!!fieldErrors.language} data-testid="import-language" />
            {fieldErrors.language && <span className="field-error">{fieldErrors.language}</span>}
          </label>
          <label className="field">
            <span>Copyright o licencia (obligatorio)</span>
            <Input value={fields.copyright} onChange={set("copyright")} placeholder="Dominio público · © Editorial, uso con permiso" aria-label="Copyright" aria-invalid={!!fieldErrors.copyright} data-testid="import-copyright" />
            {fieldErrors.copyright && <span className="field-error">{fieldErrors.copyright}</span>}
          </label>
          <div className="bible-actions">
            <Button type="button" className="primary" onClick={() => void save()} disabled={busy} data-testid="import-save">
              Importar
            </Button>
            <Button type="button" onClick={() => void cancel()} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </article>
      )}

      {customVersions.length > 0 && (
        <div className="bible-list" data-testid="custom-bibles">
          {customVersions.map((version) => (
            <article className="bible-row" key={version.id} data-testid={`custom-row-${version.id}`}>
              <h3>{version.name}</h3>
              <p className="bible-meta">
                {version.abbr} · {version.language}
                {version.stats ? ` · ${version.stats.books} libros · ${NUMBER.format(version.stats.verses)} versículos` : ""} · {version.copyright}
              </p>
              <div className="bible-actions">
                <span className="muted">Importada</span>
                <Button type="button" onClick={() => void remove(version.id)} disabled={busy}>
                  Quitar
                </Button>
              </div>
            </article>
          ))}
          {rowError && <p className="error">{rowError}</p>}
        </div>
      )}
    </section>
  );
}
