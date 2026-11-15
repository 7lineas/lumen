import type { ReactNode } from "react";
import { landingData, formatBytes, formatDate } from "./data";
import type { ReleaseFile, BibleVersion } from "./data";
import logoLight from "../../../landing/assets/logo-light.png";

const d = landingData;

function Facts({
  file,
  quiet = false,
}: {
  file?: ReleaseFile;
  quiet?: boolean;
}) {
  if (!file) return <dl className={quiet ? "facts facts-quiet" : "facts"} />;
  const rows: [string, ReactNode][] = [
    ["Archivo", file.filename],
    ["Tamaño", formatBytes(file.bytes)],
    ["SHA-256", <code key="sha">{file.sha256 || "—"}</code>],
  ];
  return (
    <dl className={quiet ? "facts facts-quiet" : "facts"}>
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function pendingMessage(file: ReleaseFile | undefined, missing: string) {
  return file
    ? `«${file.label}» (${file.filename}) se habilita cuando el archivo esté en el sitio de descargas.`
    : missing;
}

function BibleItem({ version }: { version: BibleVersion }) {
  return (
    <li>
      <strong>{`${version.name} (${version.abbr})`}</strong>
      <span>{` — ${version.language}. Licencia: ${version.license}. `}</span>
      {version.sourceUrl ? (
        <>
          Fuente:{" "}
          <a href={version.sourceUrl}>
            {version.sourceName || version.sourceUrl}
          </a>
          {". "}
        </>
      ) : version.sourceName ? (
        `Fuente: ${version.sourceName}. `
      ) : null}
      {version.availability ? `${version.availability}. ` : null}
      {version.draft ? "Borrador. " : null}
      {version.copyright ? `${version.copyright} ` : null}
      {version.attribution ? version.attribution : null}
    </li>
  );
}

export function Landing() {
  const { licenses } = d;
  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Lumen, inicio">
          <span className="brand-mark">
            <img src={logoLight} alt="" />
          </span>
          <span>
            <b>Lumen</b>
            <small>Una herramienta para la iglesia</small>
          </span>
        </a>
        <nav aria-label="Navegación principal">
          <a href="#descargar">Descargar</a>
          <a href="#instalar">Cómo instalar</a>
          <a href="#biblias">Biblias y créditos</a>
        </nav>
      </header>

      <main id="contenido">
        <section className="hero" id="inicio" aria-labelledby="titulo">
          <div className="hero-copy">
            <p className="kicker">Hecho para el culto</p>
            <h1 id="titulo">
              La Palabra, <em>lista para proyectar.</em>
            </h1>
            <p className="lede">
              Encuentre el pasaje y envíelo al videobeam en segundos. Lumen
              funciona sin internet durante el servicio: sus Biblias ya están en
              el computador.
            </p>
            <div className="hero-notes">
              <span>Gratis para Windows</span>
              <span>Funciona sin conexión</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun-disc" />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <svg className="bible-art" viewBox="0 0 520 430">
              <ellipse
                cx="265"
                cy="363"
                rx="185"
                ry="26"
                fill="#2b1a12"
                opacity=".13"
              />
              <path
                d="M91 176c58-25 111-17 169 18v168c-58-35-111-43-169-18z"
                fill="#b87333"
              />
              <path
                d="M429 176c-58-25-111-17-169 18v168c58-35 111-43 169-18z"
                fill="#5c3a21"
              />
              <path
                d="M100 183c52-20 101-12 153 19v146c-52-31-101-39-153-19z"
                fill="#fff8ee"
              />
              <path
                d="M420 183c-52-20-101-12-153 19v146c52-31 101-39 153-19z"
                fill="#efe5d6"
              />
              <path d="M253 202v146" stroke="#c8a27a" strokeWidth={4} />
              <path
                d="M126 221c34-9 65-6 95 8M126 242c34-9 65-6 95 8M126 263c34-9 65-6 95 8M394 221c-34-9-65-6-95 8M394 242c-34-9-65-6-95 8M394 263c-34-9-65-6-95 8"
                fill="none"
                stroke="#b87333"
                strokeWidth={4}
                strokeLinecap="round"
                opacity=".65"
              />
              <path
                d="M248 71v53M221 98h54M229 79l38 38M267 79l-38 38"
                stroke="#b87333"
                strokeWidth={5}
                strokeLinecap="round"
                opacity=".8"
              />
              <circle
                cx="248"
                cy="98"
                r="40"
                fill="none"
                stroke="#b87333"
                strokeWidth={2}
                opacity=".3"
              />
            </svg>
            <p className="art-caption">La Palabra siempre a la mano</p>
          </div>
        </section>

        <section
          className="download-section"
          id="descargar"
          aria-labelledby="descarga-titulo"
        >
          <div className="section-heading">
            <p className="kicker">Versión para Windows</p>
            <h2 id="descarga-titulo">Descargar Lumen</h2>
            <p id="release-meta" className="meta">
              {`Versión ${d.version} · ${formatDate(d.releasedAt)}`}
            </p>
          </div>
          <div className="download-grid">
            <article className="download-card">
              <div className="download-card-top">
                <span className="download-icon" aria-hidden="true">
                  ↓
                </span>
                <div>
                  <p className="card-eyebrow">Recomendado</p>
                  <h3>Instalador</h3>
                </div>
              </div>
              <p className="card-copy">
                Instale el programa en este computador y ábralo desde el menú
                Inicio.
              </p>
              {d.setupHref ? (
                <a id="download-setup" className="btn" href={d.setupHref}>
                  Descargar instalador <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <p id="download-setup-pending" className="pending">
                  {pendingMessage(
                    d.setup,
                    "Falta el archivo de esta descarga.",
                  )}
                </p>
              )}
              <p id="setup-url" className="url-line">
                {d.setupHref}
              </p>
              <Facts file={d.setup} />
            </article>
            <article className="download-card portable-card">
              <div className="download-card-top">
                <span className="download-icon outline" aria-hidden="true">
                  ↗
                </span>
                <div>
                  <p className="card-eyebrow">Sin instalación</p>
                  <h3>Versión portable</h3>
                </div>
              </div>
              <p className="card-copy">
                Guarde el archivo y ejecútelo cuando lo necesite. Útil si no
                puede instalar programas.
              </p>
              {d.portableHref ? (
                <a
                  id="download-portable"
                  className="btn ghost"
                  href={d.portableHref}
                >
                  Descargar portable <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <span id="download-portable-pending" className="pending">
                  {pendingMessage(
                    d.portable,
                    "Falta el archivo de esta descarga.",
                  )}
                </span>
              )}
              <p id="portable-url" className="url-line">
                {d.portableHref}
              </p>
              <Facts file={d.portable} quiet />
            </article>
          </div>
          <details className="hash-help">
            <summary>Comprobar que el archivo no cambió</summary>
            <p>
              Después de descargar, en PowerShell puede comparar el SHA-256. El
              resultado debe ser idéntico al de esta página.
            </p>
            <pre>
              <code>Get-FileHash .\archivo.exe -Algorithm SHA256</code>
            </pre>
          </details>
        </section>

        <section className="feature-band" aria-label="Características">
          <div>
            <span className="feature-number">01</span>
            <h3>Sin internet</h3>
            <p>
              Las Biblias incluidas funcionan sin conexión durante el culto.
            </p>
          </div>
          <div>
            <span className="feature-number">02</span>
            <h3>Fácil de usar</h3>
            <p>Busque un pasaje y envíelo a una pantalla o videobeam.</p>
          </div>
          <div>
            <span className="feature-number">03</span>
            <h3>Gratis y abierto</h3>
            <p>
              Una herramienta gratuita con código abierto bajo licencia MIT.
            </p>
          </div>
        </section>

        <section
          className="content-section"
          aria-labelledby="requisitos-titulo"
        >
          <div className="section-heading">
            <p className="kicker">Antes de empezar</p>
            <h2 id="requisitos-titulo">Qué necesita</h2>
          </div>
          <ul className="check-list">
            <li>Windows 10 o Windows 11, de 64 bits.</li>
            <li>
              Un videobeam o segundo monitor, conectado por HDMI si va a
              proyectar.
            </li>
            <li>
              Internet solo para descargar el programa; el culto puede seguir
              sin red.
            </li>
          </ul>
          <p>
            Con un solo monitor también abre: la ventana del versículo queda
            junto al panel, útil para ensayar.
          </p>
        </section>

        <section
          className="content-section install-section"
          id="instalar"
          aria-labelledby="instalar-titulo"
        >
          <div className="section-heading">
            <p className="kicker">En pocos pasos</p>
            <h2 id="instalar-titulo">Cómo instalarlo</h2>
          </div>
          <ol className="steps">
            <li>Descargue el instalador.</li>
            <li>Ábralo con doble clic.</li>
            <li>
              Si Windows muestra el aviso de abajo, siga esos tres clics. No
              desactive el antivirus.
            </li>
            <li>Elija la carpeta de instalación y termine el asistente.</li>
            <li>
              Abra <strong>Lumen</strong> desde el menú Inicio.
            </li>
            <li>
              Conecte el videobeam, pulse <kbd>Windows</kbd> + <kbd>P</kbd> y
              elija <strong>Extender</strong>. En Ajustes, seleccione la
              pantalla del proyector.
            </li>
          </ol>
          <p>
            La versión portable no se instala: se guarda el archivo y se abre
            cuando haga falta. Sirve en un computador donde no se pueden
            instalar programas.
          </p>
        </section>

        <section className="notice" aria-labelledby="smartscreen-titulo">
          <div className="notice-mark" aria-hidden="true">
            i
          </div>
          <div>
            <p className="kicker">Un aviso de Windows</p>
            <h2 id="smartscreen-titulo">Windows protegió su PC</h2>
            <p>
              El programa todavía no tiene firma digital, así que Windows lo
              trata como de un editor desconocido. El aviso es esperable. Para
              continuar:
            </p>
            <ol>
              <li>
                En la ventana azul, pulse <strong>Más información</strong>.
              </li>
              <li>
                Pulse <strong>Ejecutar de todas formas</strong>.
              </li>
              <li>Siga el instalador con normalidad.</li>
            </ol>
            <p>
              Si no aparece «Más información», pida a quien administra el
              computador que permita abrir este archivo. No hace falta
              desactivar SmartScreen para todo Windows.
            </p>
          </div>
        </section>

        <section
          className="content-section bible-section"
          id="biblias"
          aria-labelledby="biblias-titulo"
        >
          <div className="section-heading">
            <p className="kicker">Transparencia y licencias</p>
            <h2 id="biblias-titulo">Versiones bíblicas y créditos</h2>
          </div>
          <p id="distribution-note">{licenses.distributionNote || ""}</p>
          <ul id="bible-list" className="bible-list">
            {(licenses.versions || []).map((version) => (
              <BibleItem key={version.abbr} version={version} />
            ))}
          </ul>
          <p id="excluded-note" className="quiet">
            {licenses.excludedNote || ""}
          </p>
        </section>

        <section className="support">
          <p className="kicker">¿Necesita ayuda?</p>
          <h2>Estamos para servirle.</h2>
          <p id="support-copy">
            Si la descarga no abre o el videobeam queda en negro, revise los
            pasos de instalación o pida ayuda a quien preparó el computador del
            culto.
            {d.supportHref ? (
              <>
                {" También puede escribir a "}
                <a href={d.supportHref}>{d.supportLabel || d.supportHref}</a>.
              </>
            ) : null}
          </p>
        </section>
      </main>
      <footer className="site-footer">
        <span>Lumen</span>
        <p>
          Programa gratuito. El código es MIT. Los textos bíblicos conservan la
          licencia de cada versión.
        </p>
        <a href="#inicio">Volver arriba ↑</a>
      </footer>
    </>
  );
}
