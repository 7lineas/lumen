import { useEffect, useState } from "react";
import { BookOpen, FileText, Film, Music } from "lucide-react";
import bibleLicenses from "../../shared/bible-licenses.json";
import logo from "../assets/lumen-logo.png";
import type { BibleLibraryEntry } from "../vite-env.d";

const FEATURES = [
  {
    icon: BookOpen,
    title: "Biblia",
    text: "Busque un pasaje y proyecte versículo por versículo, en la versión que elija.",
  },
  {
    icon: Music,
    title: "Canciones",
    text: "Letras por partes, en el orden en que están escritas y un fundido suave entre diapositivas.",
  },
  {
    icon: FileText,
    title: "Textos",
    text: "Escribe un texto sobre la marcha y proyéctalo por bloques, igual que una canción.",
  },
  {
    icon: Film,
    title: "Media",
    text: "Imágenes, videos y audio listos antes del servicio, sin esperar en el momento.",
  },
];

export function AboutModal() {
  const [extras, setExtras] = useState<BibleLibraryEntry[]>([]);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    void window.proyector
      ?.getAppUpdateState()
      .then((state) => setAppVersion(state.currentVersion))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const known = new Set(bibleLicenses.versions.map((version) => version.id));
    void window.proyector
      ?.getBibleCatalog()
      .then((view) =>
        setExtras(view.entries.filter((entry) => !known.has(entry.id))),
      )
      .catch(() => undefined);
  }, []);

  return (
    <div className="about">
      <section className="about-hero">
        <span className="about-beam" aria-hidden />
        <div className="about-hero-text">
          <p className="about-wordmark">Lumen</p>
          <p className="about-pitch">
            Todo lo que el servicio necesita en pantalla, desde el primer
            minuto.
          </p>
          <p className="about-version">Versión {appVersion ?? "1.0"}</p>
        </div>
        <img className="about-hero-logo" src={logo} alt="" aria-hidden />
      </section>

      <ul className="about-features">
        {FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <li
              key={feature.title}
              className="about-feature"
              style={{ animationDelay: `${180 + index * 90}ms` }}
            >
              <span className="about-feature-icon">
                <Icon size={18} strokeWidth={2} aria-hidden />
              </span>
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <details className="about-legal">
        <summary>Textos bíblicos y licencias</summary>
        <ul>
          {bibleLicenses.versions.map((version) => (
            <li key={version.id}>
              <strong>{version.name}</strong> ({version.abbr}).{" "}
              {version.license}. {version.copyright}
            </li>
          ))}
          {extras.map((version) => (
            <li key={version.id}>
              <strong>{version.name}</strong> ({version.abbr}).{" "}
              {version.license}. {version.copyright}
            </li>
          ))}
        </ul>
        <p>{bibleLicenses.distributionNote}</p>
        <p>
          {bibleLicenses.excludedNote} Detalle en{" "}
          <code>LICENSES/BIBLES.md</code>.
        </p>
        <p>Código fuente bajo licencia MIT.</p>
      </details>

      <p className="about-footnote">
        Para voluntarios: consulte el archivo README en la carpeta de
        instalación.
      </p>
    </div>
  );
}
