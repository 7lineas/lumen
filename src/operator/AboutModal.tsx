import { useEffect, useState } from "react";
import bibleLicenses from "../../shared/bible-licenses.json";
import type { BibleLibraryEntry } from "../vite-env.d";

export function AboutModal() {
  const [extras, setExtras] = useState<BibleLibraryEntry[]>([]);

  useEffect(() => {
    const known = new Set(bibleLicenses.versions.map((version) => version.id));
    void window.proyector
      ?.getBibleCatalog()
      .then((view) => setExtras(view.entries.filter((entry) => !known.has(entry.id))))
      .catch(() => undefined);
  }, []);

  return (
    <main className="panel single about">
      <h2>Acerca de Lumen</h2>
      <p>
        Aplicación offline para proyectar versículos en el culto. Versión 1.0. Sin conexión a internet
        necesaria durante el servicio.
      </p>

      <h3>Textos bíblicos</h3>
      <ul>
        {bibleLicenses.versions.map((version) => (
          <li key={version.id}>
            <strong>
              {version.name} ({version.abbr})
            </strong>{" "}
            — {version.language}. {version.availability}. Licencia: {version.license}.
            {version.draft ? " Borrador." : ""} Fuente: {version.sourceName}. {version.attribution}{" "}
            {version.copyright}
          </li>
        ))}
        {extras.map((version) => (
          <li key={version.id}>
            <strong>
              {version.name} ({version.abbr})
            </strong>{" "}
            — {version.language}. Licencia: {version.license}.
            {version.draft ? " Borrador." : ""} {version.attribution} {version.copyright}
          </li>
        ))}
      </ul>
      <p className="muted">{bibleLicenses.distributionNote}</p>
      <p className="muted">{bibleLicenses.extensionNote}</p>
      <p className="muted">
        {bibleLicenses.excludedNote} Detalle en <code>LICENSES/BIBLES.md</code>.
      </p>

      <h3>Licencia del programa</h3>
      <p>Código fuente: MIT. Cada texto bíblico conserva la licencia indicada arriba.</p>

      <h3>Soporte</h3>
      <p>Para voluntarios: consulte el archivo README en la carpeta de instalación.</p>
    </main>
  );
}
