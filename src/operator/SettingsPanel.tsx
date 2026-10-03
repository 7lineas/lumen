import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
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
        <Input
          value={local.churchName}
          onChange={(e) => setLocal({ ...local, churchName: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Pantalla del proyector</span>
        <Select
          value={local.projectorDisplayId == null ? "auto" : String(local.projectorDisplayId)}
          onValueChange={(value) =>
            value && setLocal({ ...local, projectorDisplayId: value === "auto" ? null : parseInt(value, 10) })
          }
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automática (segunda pantalla)</SelectItem>
          {displays.map((d) => (
            <SelectItem key={d.id} value={String(d.id)}>
              {d.label} {d.primary ? "(principal)" : ""}
            </SelectItem>
          ))}
          </SelectContent>
        </Select>
      </label>

      <label className="field checkbox">
        <Checkbox
          checked={local.showCopyright}
          onCheckedChange={(checked) => setLocal({ ...local, showCopyright: checked === true })}
        />
        <span>Mostrar la línea de copyright en el pie de la proyección</span>
      </label>

      <label className="field checkbox">
        <Checkbox
          checked={local.dualView}
          onCheckedChange={(checked) => setLocal({ ...local, dualView: checked === true })}
        />
        <span>Dos versiones lado a lado en el proyector</span>
      </label>

      {local.dualView && (
        <label className="field">
          <span>Segunda versión</span>
          <Select
            value={local.secondaryVersionId ?? "none"}
            onValueChange={(value) => value && setLocal({ ...local, secondaryVersionId: value === "none" ? null : value })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {versions
              .filter((v) => v.id !== local.primaryVersionId)
              .map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}

      <label className="field">
        <span>Tema del proyector</span>
        <Select value={local.theme} onValueChange={(value) => value && setLocal({ ...local, theme: value as "dark" | "light" })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Oscuro</SelectItem>
            <SelectItem value="light">Claro</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="field">
        <span>Tamaño de fuente ({local.fontSize}px)</span>
        <Slider
          min={40}
          max={120}
          value={[local.fontSize]}
          onValueChange={(value) => {
            const next = Array.isArray(value) ? value[0] : value;
            setLocal({ ...local, fontSize: next ?? local.fontSize });
          }}
        />
      </label>

      <label className="field">
        <span>Color de fondo</span>
        <Input
          type="color"
          value={local.backgroundColor}
          onChange={(e) => setLocal({ ...local, backgroundColor: e.target.value })}
        />
      </label>

      <div className="field row">
        <Button
          type="button"
          onClick={async () => {
            const path = await window.proyector?.pickBackgroundImage();
            if (path) setLocal({ ...local, backgroundImagePath: path });
          }}
        >
          Imagen de fondo…
        </Button>
        {local.backgroundImagePath && (
          <Button
            type="button"
            onClick={() => setLocal({ ...local, backgroundImagePath: null })}
          >
            Quitar imagen
          </Button>
        )}
      </div>

      <label className="field">
        <span>Transición (ms)</span>
        <Input
          type="number"
          min={0}
          max={2000}
          value={local.fadeMs}
          onChange={(e) => setLocal({ ...local, fadeMs: parseInt(e.target.value, 10) || 0 })}
        />
      </label>

      <Button type="button" className="primary" onClick={() => void onSave(local)}>
        Guardar ajustes
      </Button>
    </main>
  );
}
