import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { Check, Copy, MonitorPlay, Palette, Play, Rabbit, Timer, Turtle, Wifi, type LucideIcon } from "lucide-react";
import type { AppSettings, BibleVersionMeta } from "@shared/types";
import type { DisplayInfo } from "../vite-env.d";
import type { BrowserAccessInfo } from "../vite-env.d";

/** Read once when the app starts, so opening Ajustes already has the access state and QR codes. */
let browserAccessCache: BrowserAccessInfo | null = null;
let browserQrCache: Record<string, string> = {};

async function makeQrCodes(info: BrowserAccessInfo): Promise<Record<string, string>> {
  if (!info.enabled || !info.pairingCode) return {};
  const entries = await Promise.all(
    info.addresses.map(async (address) => {
      const connectUrl = `http://${address}:${info.port}/?pair=${info.pairingCode}`;
      return [address, await QRCode.toDataURL(connectUrl, { width: 220, margin: 2, errorCorrectionLevel: "M" })] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function primeBrowserAccess(): Promise<void> {
  const info = await window.proyector?.getBrowserAccess();
  if (!info) return;
  browserQrCache = await makeQrCodes(info).catch(() => ({}));
  browserAccessCache = info;
}

if (!window.__LUMEN_BROWSER__) void primeBrowserAccess();

interface Props {
  settings: AppSettings;
  versions: BibleVersionMeta[];
  onSave: (s: AppSettings) => Promise<void>;
}

function SettingsGroup({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="ajustes-group">
      <h3>
        <Icon size={15} strokeWidth={2} aria-hidden />
        {title}
      </h3>
      <div className="ajustes-rows">{children}</div>
    </section>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="ajustes-row">
      <div className="ajustes-row-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="ajustes-row-control">{children}</div>
    </div>
  );
}

type DemoContent = "hebrew" | "letra" | "gradient";

/** A small sample that fades in and out with the chosen duration. */
function TransitionDemo({ ms, runKey, content }: { ms: number; runKey: number; content: DemoContent }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (runKey === 0) return;
    setShown(false);
    const show = window.setTimeout(() => setShown(true), 250);
    const hide = window.setTimeout(() => setShown(false), 250 + ms + 900);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [runKey, ms]);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="ajustes-demo" aria-hidden>
      <div
        className={`ajustes-demo-card is-${content}`}
        style={{ opacity: shown ? 1 : 0, transitionDuration: reduceMotion ? "0ms" : `${ms}ms` }}
      >
        {content === "hebrew" && <span className="ajustes-demo-text" lang="he" dir="rtl">ישוע</span>}
        {content === "letra" && <span className="ajustes-demo-text">Letra</span>}
      </div>
    </div>
  );
}

/** The slider runs slow (left) to fast (right), so its value is flipped against the stored ms. */
const MAX_MS = 2000;

function TransitionRow({
  label,
  value,
  content,
  onChange,
}: {
  label: string;
  value: number;
  content: DemoContent;
  onChange: (ms: number) => void;
}) {
  const [runKey, setRunKey] = useState(0);
  return (
    <div className="ajustes-transition">
      <div className="ajustes-transition-head">
        <span>{label}</span>
      </div>
      <div className="ajustes-transition-controls">
        <Turtle size={16} strokeWidth={1.75} aria-hidden />
        <Slider
          className="ajustes-slider"
          min={0}
          max={MAX_MS}
          step={50}
          value={[MAX_MS - value]}
          onValueChange={(next) => {
            const slider = Array.isArray(next) ? next[0] : next;
            onChange(slider === undefined ? value : MAX_MS - slider);
            setRunKey((k) => k + 1);
          }}
        />
        <Rabbit size={16} strokeWidth={1.75} aria-hidden />
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Probar transición de ${label}`} onClick={() => setRunKey((k) => k + 1)}>
          <Play size={14} aria-hidden />
        </Button>
        <TransitionDemo ms={value} runKey={runKey} content={content} />
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, versions, onSave }: Props) {
  const [local, setLocal] = useState(settings);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [browserAccess, setBrowserAccess] = useState<BrowserAccessInfo | null>(browserAccessCache);
  const [browserAccessBusy, setBrowserAccessBusy] = useState(false);
  const [browserQrCodes, setBrowserQrCodes] = useState<Record<string, string>>(browserQrCache);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  // Save on change: wait a moment so slider drags save once, and only when
  // the values differ from what is already saved (so the echo does not loop).
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<AppSettings | null>(null);
  useEffect(() => {
    if (JSON.stringify(local) === JSON.stringify(settings)) return;
    pendingSave.current = local;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      pendingSave.current = null;
      await onSave(local);
      toast.success("Ajustes guardados");
    }, 350);
  }, [local]);

  // Leaving before the timer fires still keeps the last change.
  useEffect(() => () => {
    window.clearTimeout(saveTimer.current);
    if (pendingSave.current) void onSave(pendingSave.current);
  }, []);

  useEffect(() => {
    if (!browserAccess) return;
    browserAccessCache = browserAccess;
    let cancelled = false;
    void makeQrCodes(browserAccess)
      .then((codes) => {
        if (cancelled) return;
        browserQrCache = codes;
        setBrowserQrCodes(codes);
      })
      .catch(() => {
        if (!cancelled) setBrowserQrCodes({});
      });
    return () => {
      cancelled = true;
    };
  }, [browserAccess]);

  useEffect(() => {
    void window.proyector?.listDisplays().then(setDisplays);
    if (!window.__LUMEN_BROWSER__ && !browserAccessCache) void window.proyector?.getBrowserAccess().then(setBrowserAccess);
  }, []);

  const copyPairingCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1600);
    } catch {
      // Clipboard can be blocked in some browser contexts; the code stays visible to copy by hand.
    }
  };

  // Known from the first render, so the section keeps its height while the state loads.
  const accessStatus = !browserAccess
    ? "Cargando…"
    : browserAccessBusy
      ? "Aplicando…"
      : browserAccess.enabled
        ? "Activo en la red local"
        : "Apagado";

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
    <div className="settings">
      {!window.__LUMEN_BROWSER__ && (
        <SettingsGroup icon={Wifi} title="Acceso desde otros dispositivos">
          <div className="ajustes-access">
            <div className="ajustes-access-head">
              <div className="ajustes-row-text">
                <span>Abrir Lumen en otro equipo</span>
                <small>{accessStatus}</small>
              </div>
              <Switch
                checked={browserAccess?.enabled ?? false}
                disabled={!browserAccess || browserAccessBusy}
                onCheckedChange={() => void toggleBrowserAccess()}
                aria-label="Acceso desde otros dispositivos"
              />
            </div>

            {browserAccess?.enabled && (
              <div className="ajustes-access-body">
                <div className="ajustes-access-split">
                  {browserAccess.addresses.length ? (
                    <ul className="ajustes-access-qrs">
                      {browserAccess.addresses.map((address) => (
                        <li key={address}>
                          <div className="ajustes-access-qr-slot">
                            {browserQrCodes[address] && (
                              <img src={browserQrCodes[address]} alt={`Código QR para conectar a ${address}`} />
                            )}
                          </div>
                          <a href={`http://${address}:${browserAccess.port}`} target="_blank" rel="noreferrer">
                            {address}:{browserAccess.port}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ajustes-note">No se detectó una dirección de red activa.</p>
                  )}
                  <div className="ajustes-access-side">
                  <div className="ajustes-access-code">
                    <small>Código de acceso</small>
                    <code>{browserAccess.pairingCode}</code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Copiar código"
                      onClick={() => void copyPairingCode(browserAccess.pairingCode)}
                    >
                      {codeCopied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                      {codeCopied ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                  <div className="ajustes-access-split">
                    <div className="ajustes-access-explain">
                      <p className="ajustes-note">
                        Escanee el QR o abra la dirección e ingrese el código.
                      </p>
                    </div>
                  </div>
                  </div>
                </div>
                <p className="ajustes-access-warn">Compártalo solo con operadores de confianza.</p>
              </div>
            )}
          </div>
        </SettingsGroup>
      )}

      <SettingsGroup icon={Timer} title="Transiciones">
        <TransitionRow label="Biblia" content="hebrew" value={local.fadeMs} onChange={(ms) => setLocal({ ...local, fadeMs: ms })} />
        <TransitionRow label="Canciones" content="letra" value={local.songFadeMs} onChange={(ms) => setLocal({ ...local, songFadeMs: ms })} />
        <TransitionRow label="Fondo" content="gradient" value={local.backgroundFadeMs} onChange={(ms) => setLocal({ ...local, backgroundFadeMs: ms })} />
        <SettingRow label="Animar ventanas" hint="Fundido al abrir y cerrar">
          <Switch
            checked={local.overlayAnimation}
            onCheckedChange={(checked) => setLocal({ ...local, overlayAnimation: checked === true })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup icon={Palette} title="Texto">
        <SettingRow label="Color del texto" hint="Se aplica a lo proyectado">
          <Select value={local.theme} items={[{ value: "dark", label: "Texto claro" }, { value: "light", label: "Texto oscuro" }]} onValueChange={(value) => value && setLocal({ ...local, theme: value as "dark" | "light" })}>
            <SelectTrigger className="ajustes-select"><SelectValue /></SelectTrigger>
            <SelectContent className="ajustes-select-popup" alignItemWithTrigger={false}>
              <SelectItem value="dark">Texto claro</SelectItem>
              <SelectItem value="light">Texto oscuro</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="Canciones en mayúsculas" hint="Solo en canciones, no en la Biblia">
          <Switch
            checked={local.songUppercase}
            onCheckedChange={(checked) => setLocal({ ...local, songUppercase: checked === true })}
          />
        </SettingRow>

        <SettingRow label="Color de acento" hint="Referencia y versión">
          <label className="ajustes-swatch" style={{ background: local.accentColor }}>
            <span className="sr-only">Color de acento</span>
            <Input
              type="color"
              value={local.accentColor}
              onChange={(e) => setLocal({ ...local, accentColor: e.target.value })}
            />
          </label>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup icon={MonitorPlay} title="Proyector">
        <SettingRow label="Pantalla" hint="Dónde se muestra la proyección">
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
            <SelectTrigger className="ajustes-select"><SelectValue /></SelectTrigger>
            <SelectContent className="ajustes-select-popup" alignItemWithTrigger={false}>
              <SelectItem value="auto">Automática (segunda pantalla)</SelectItem>
              {displays.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.label} {d.primary ? "(principal)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="Dos versiones lado a lado" hint="Muestra dos textos en la misma diapositiva">
          <Switch
            checked={local.dualView}
            onCheckedChange={(checked) => setLocal({ ...local, dualView: checked === true })}
          />
        </SettingRow>

        {local.dualView && (
          <SettingRow label="Segunda versión">
            <Select
              value={local.secondaryVersionId ?? "none"}
              items={[
                { value: "none", label: "—" },
                ...versions.map((v) => ({ value: v.id, label: v.name })),
              ]}
              onValueChange={(value) => value && setLocal({ ...local, secondaryVersionId: value === "none" ? null : value })}
            >
              <SelectTrigger className="ajustes-select"><SelectValue /></SelectTrigger>
              <SelectContent className="ajustes-select-popup" alignItemWithTrigger={false}>
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
          </SettingRow>
        )}
      </SettingsGroup>

    </div>
  );
}
