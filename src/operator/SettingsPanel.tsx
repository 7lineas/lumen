import { useEffect, useState } from "react";
import type { AppSettings, BibleVersionMeta } from "@shared/types";
import type { DisplayInfo } from "../vite-env.d";

interface Props {
  settings: AppSettings;
  versions: BibleVersionMeta[];
  onSave: (s: AppSettings) => Promise<void>;
}

export function SettingsPanel({ settings, versions, onSave }: Props) {
  const [local, setLocal] = useState(settings);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  useEffect(() => {
    void window.proyector?.listDisplays().then(setDisplays);
  }, []);

  return (
    <main className="panel single settings">
      <h2>Ajustes</h2>

      <label className="field">
        <span>Nombre en la pantalla de logo</span>
        <input
          value={local.churchName}
          onChange={(e) => setLocal({ ...local, churchName: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Pantalla del proyector</span>
        <select
          value={local.projectorDisplayId ?? ""}
          onChange={(e) =>
            setLocal({
              ...local,
              projectorDisplayId: e.target.value ? parseInt(e.target.value, 10) : null,
            })
          }
        >
          <option value="">Automática (segunda pantalla)</option>
          {displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} {d.primary ? "(principal)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={local.showCopyright}
          onChange={(e) => setLocal({ ...local, showCopyright: e.target.checked })}
        />
        <span>Mostrar la línea de copyright en el pie de la proyección</span>
      </label>

      <label className="field checkbox">
        <input
          type="checkbox"
          checked={local.dualView}
          onChange={(e) => setLocal({ ...local, dualView: e.target.checked })}
        />
        <span>Dos versiones lado a lado en el proyector</span>
      </label>

      {local.dualView && (
        <label className="field">
          <span>Segunda versión</span>
          <select
            value={local.secondaryVersionId ?? ""}
            onChange={(e) =>
              setLocal({ ...local, secondaryVersionId: e.target.value || null })
            }
          >
            <option value="">—</option>
            {versions
              .filter((v) => v.id !== local.primaryVersionId)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Tema del proyector</span>
        <select
          value={local.theme}
          onChange={(e) => setLocal({ ...local, theme: e.target.value as "dark" | "light" })}
        >
          <option value="dark">Oscuro</option>
          <option value="light">Claro</option>
        </select>
      </label>

      <label className="field">
        <span>Tamaño de fuente ({local.fontSize}px)</span>
        <input
          type="range"
          min={40}
          max={120}
          value={local.fontSize}
          onChange={(e) => setLocal({ ...local, fontSize: parseInt(e.target.value, 10) })}
        />
      </label>

      <label className="field">
        <span>Color de fondo</span>
        <input
          type="color"
          value={local.backgroundColor}
          onChange={(e) => setLocal({ ...local, backgroundColor: e.target.value })}
        />
      </label>

      <div className="field row">
        <button
          type="button"
          onClick={async () => {
            const path = await window.proyector?.pickBackgroundImage();
            if (path) setLocal({ ...local, backgroundImagePath: path });
          }}
        >
          Imagen de fondo…
        </button>
        {local.backgroundImagePath && (
          <button
            type="button"
            onClick={() => setLocal({ ...local, backgroundImagePath: null })}
          >
            Quitar imagen
          </button>
        )}
      </div>

      <label className="field">
        <span>Transición (ms)</span>
        <input
          type="number"
          min={0}
          max={2000}
          value={local.fadeMs}
          onChange={(e) => setLocal({ ...local, fadeMs: parseInt(e.target.value, 10) || 0 })}
        />
      </label>

      <button type="button" className="primary" onClick={() => void onSave(local)}>
        Guardar ajustes
      </button>
    </main>
  );
}
