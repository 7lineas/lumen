import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { AppSettings, BibleVersionMeta } from "@shared/types";
import type { DisplayInfo } from "../vite-env.d";
import type { BrowserAccessInfo } from "../vite-env.d";

interface Props {
  settings: AppSettings;
  versions: BibleVersionMeta[];
  onSave: (s: AppSettings) => Promise<void>;
}

export function SettingsPanel({ settings, versions, onSave }: Props) {
  const [local, setLocal] = useState(settings);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [browserAccess, setBrowserAccess] = useState<BrowserAccessInfo | null>(null);
  const [browserAccessBusy, setBrowserAccessBusy] = useState(false);
  const [browserQrCodes, setBrowserQrCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  useEffect(() => {
    if (!browserAccess?.enabled || !browserAccess.pairingCode) {
      setBrowserQrCodes({});
      return;
    }
    let cancelled = false;
    void Promise.all(browserAccess.addresses.map(async (address) => {
      const connectUrl = `http://${address}:${browserAccess.port}/?pair=${browserAccess.pairingCode}`;
      return [address, await QRCode.toDataURL(connectUrl, { width: 220, margin: 2, errorCorrectionLevel: "M" })] as const;
    })).then((entries) => {
      if (!cancelled) setBrowserQrCodes(Object.fromEntries(entries));
    }).catch(() => {
      if (!cancelled) setBrowserQrCodes({});
    });
    return () => { cancelled = true; };
  }, [browserAccess]);

  useEffect(() => {
    void window.proyector?.listDisplays().then(setDisplays);
    if (!window.__LUMEN_BROWSER__) void window.proyector?.getBrowserAccess().then(setBrowserAccess);
  }, []);

  const toggleBrowserAccess = async () => {
    if (browserAccessBusy || !browserAccess) return;
    setBrowserAccessBusy(true);
    try {
      setBrowserAccess(await window.proyector?.setBrowserAccess(!browserAccess.enabled) ?? browserAccess);
    } finally {
      setBrowserAccessBusy(false);
    }
  };

  return (
    <main className="panel single settings">
      <h2>Ajustes</h2>

      {!window.__LUMEN_BROWSER__ && browserAccess && (
        <section className="field" aria-labelledby="browser-access-title">
          <strong id="browser-access-title">Acceso desde otros dispositivos</strong>
          <p className="muted">Escanea el QR con una tableta o computadora conectada a la misma red para abrir Lumen.</p>
          <Button type="button" variant={browserAccess.enabled ? "destructive" : "default"} disabled={browserAccessBusy} onClick={() => void toggleBrowserAccess()}>
            {browserAccessBusy ? "Aplicando…" : browserAccess.enabled ? "Desactivar acceso de red" : "Activar acceso de red"}
          </Button>
          {browserAccess.enabled && (
            <div className="browser-access-details">
              <p><strong>Escanea para conectar</strong></p>
              {browserAccess.addresses.length ? browserAccess.addresses.map((address) => (
                <div className="browser-address-card" key={address}>
                  {browserQrCodes[address] && <img src={browserQrCodes[address]} alt={`Código QR para conectar a ${address}`} />}
                  <a href={`http://${address}:${browserAccess.port}`} target="_blank" rel="noreferrer">http://{address}:{browserAccess.port}</a>
                </div>
              )) : <p>No se detectó una dirección de red activa.</p>}
              <p><strong>Código de acceso</strong></p>
              <code className="browser-access-token">{browserAccess.pairingCode}</code>
              <p className="muted">Si no puedes escanear el QR, abre la dirección en el navegador e ingresa este código de seis dígitos. Compártelo solo con operadores de confianza en tu red local.</p>
            </div>
          )}
        </section>
      )}

      <label className="field">
        <span>Pantalla del proyector</span>
        <Select
          value={local.projectorDisplayId == null ? "auto" : String(local.projectorDisplayId)}
          items={[
            { value: "auto", label: "Automática (segunda pantalla)" },
            ...displays.map((d) => ({
              value: String(d.id),
              label: `${d.label} ${d.primary ? "(principal)" : ""}`.trim(),
            })),
          ]}
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
            items={[
              { value: "none", label: "—" },
              ...versions.map((v) => ({ value: v.id, label: v.name })),
            ]}
            onValueChange={(value) => value && setLocal({ ...local, secondaryVersionId: value === "none" ? null : value })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {versions
              .filter((v) => v.id !== local.primaryVersionId)
              .map((v) => (
                <SelectItem key={v.id} value={v.id} disabled={v.locked} title={v.lockedReason}>
                  {v.name}{v.online ? " (en línea)" : ""}{v.custom ? " (mía)" : ""}{v.locked ? " · requiere licencia" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}

      <label className="field">
        <span>Tema del proyector</span>
        <Select value={local.theme} items={[{ value: "dark", label: "Oscuro" }, { value: "light", label: "Claro" }]} onValueChange={(value) => value && setLocal({ ...local, theme: value as "dark" | "light" })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Oscuro</SelectItem>
            <SelectItem value="light">Claro</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="field">
        <span>Color de acento (referencia y versión)</span>
        <Input
          type="color"
          value={local.accentColor}
          onChange={(e) => setLocal({ ...local, accentColor: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Transición Biblia (ms)</span>
        <Input
          type="number"
          min={0}
          max={2000}
          value={local.fadeMs}
          onChange={(e) => setLocal({ ...local, fadeMs: parseInt(e.target.value, 10) || 0 })}
        />
      </label>

      <label className="field">
        <span>Transición Canciones (ms)</span>
        <Input
          type="number"
          min={0}
          max={2000}
          value={local.songFadeMs}
          onChange={(e) => setLocal({ ...local, songFadeMs: parseInt(e.target.value, 10) || 0 })}
        />
      </label>

      <label className="field">
        <span>Fundido del fondo (ms)</span>
        <Input
          type="number"
          min={0}
          max={2000}
          value={local.backgroundFadeMs}
          onChange={(e) => setLocal({ ...local, backgroundFadeMs: parseInt(e.target.value, 10) || 0 })}
        />
      </label>

      <Button type="button" className="primary" onClick={() => void onSave(local)}>
        Guardar ajustes
      </Button>
    </main>
  );
}
