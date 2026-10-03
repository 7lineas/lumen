import { useEffect, useRef, useState } from "react";
import type { AppSettings, ProjectorPayload } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import { backgroundImageUrl, isBackgroundVideo } from "@shared/background-image";

const EMPTY: ProjectorPayload = {
  mode: "blank",
  referenceLabel: "",
  blocks: [],
  churchName: DEFAULT_SETTINGS.churchName,
  fontSize: DEFAULT_SETTINGS.fontSize,
  brightness: 1,
  padding: DEFAULT_SETTINGS.padding,
  theme: "dark",
  backgroundColor: "#000000",
  copyright: "",
};

function splitReference(label: string): { ref: string; version: string } {
  const sep = label.lastIndexOf(" — ");
  if (sep < 0) return { ref: label, version: "" };
  return { ref: label.slice(0, sep), version: label.slice(sep + 3) };
}

function contentKey(p: ProjectorPayload): string {
  if (p.mode === "blank") return "blank";
  if (p.mode === "logo") return `logo:${p.churchName}`;
  return `verse:${p.referenceLabel}|${p.blocks.map((b) => `${b.label ?? ""}=${b.text}`).join("|")}`;
}

export function ProjectorView() {
  // `payload` is what is currently displayed (lags behind incoming updates
  // during the fade-out phase so the old content can fade instead of cutting).
  const [payload, setPayload] = useState<ProjectorPayload>(EMPTY);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [visible, setVisible] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const displayedRef = useRef<ProjectorPayload>(EMPTY);
  const visibleRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fitSize, setFitSize] = useState(settings.fontSize);

  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    void api.getSettings().then((s) => setSettings({ ...DEFAULT_SETTINGS, ...s }));
    const show = (v: boolean) => {
      visibleRef.current = v;
      setVisible(v);
    };
    const fadeIn = (p: ProjectorPayload) => {
      // Double rAF so the browser paints the hidden state before the
      // `.show` class lands — otherwise the transition never runs.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => show(p.mode !== "blank"));
      });
    };
    const off = api.onProjectorUpdate((p) => {
      const ms = Math.max(0, p.fadeMs ?? settingsRef.current.fadeMs ?? DEFAULT_SETTINGS.fadeMs);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (ms === 0) {
        displayedRef.current = p;
        setPayload(p);
        show(p.mode !== "blank");
        return;
      }
      // Style-only update (font, brightness, theme…): apply instantly so
      // live tweaks don't flicker.
      if (contentKey(p) === contentKey(displayedRef.current)) {
        displayedRef.current = p;
        setPayload(p);
        if (p.mode !== "blank" && !visibleRef.current) show(true);
        return;
      }
      // Nothing on screen: swap immediately, then fade in.
      if (!visibleRef.current || displayedRef.current.mode === "blank") {
        displayedRef.current = p;
        setPayload(p);
        show(false);
        fadeIn(p);
        return;
      }
      // Content change: fade the old content out, swap, fade the new in.
      show(false);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        displayedRef.current = p;
        setPayload(p);
        fadeIn(p);
      }, ms);
    });
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      off?.();
    };
  }, []);

  const fontSize = payload.fontSize || settings.fontSize;

  useEffect(() => {
    setFitSize(fontSize);
  }, [fontSize, payload]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || payload.mode !== "verse") return;
    let size = fontSize;
    const fit = () => {
      el.style.fontSize = `${size}px`;
      while (size > 28 && el.scrollHeight > window.innerHeight * 0.72) {
        size -= 2;
        el.style.fontSize = `${size}px`;
      }
      setFitSize(size);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [payload, fontSize]);

  const themeClass = (payload.theme ?? settings.theme) === "light" ? "projector light" : "projector dark";
  const brightness = payload.brightness ?? settings.brightness ?? 1;
  const fadeMs = payload.fadeMs ?? settings.fadeMs ?? DEFAULT_SETTINGS.fadeMs;
  const fadeStyle: React.CSSProperties = { transitionDuration: `${Math.max(0, fadeMs)}ms` };
  const bg = backgroundImageUrl(payload.backgroundImagePath ?? settings.backgroundImagePath);
  const style: React.CSSProperties = {
    fontSize: `${fitSize}px`,
    padding: `${payload.padding ?? settings.padding ?? DEFAULT_SETTINGS.padding}vw`,
  };
  const backgroundStyle: React.CSSProperties = {
    backgroundColor: bg ? undefined : payload.backgroundColor || settings.backgroundColor,
    backgroundImage: bg ? `url("${bg}")` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    transition: `background-color ${Math.max(0, payload.backgroundFadeMs ?? settings.backgroundFadeMs ?? DEFAULT_SETTINGS.backgroundFadeMs)}ms ease`,
    filter: payload.mode === "blank" ? undefined : `brightness(${brightness})`,
  };

  if (payload.mode === "blank") {
    return <div className={`${themeClass} blank`} style={{ backgroundColor: "#000" }} />;
  }

  if (payload.mode === "logo") {
    return (
      <div className={themeClass} style={style}>
        <div className="projector-background-layer" style={backgroundStyle} />
        {isBackgroundVideo(payload.backgroundImagePath ?? settings.backgroundImagePath) && <video className="projector-background-video" style={{ filter: `brightness(${brightness})` }} src={bg} muted loop autoPlay playsInline />}
        <div className={`projector-inner fade ${visible ? "show" : ""}`} style={fadeStyle}>
          <p className="projector-logo">{payload.churchName || settings.churchName}</p>
        </div>
      </div>
    );
  }

  const { ref, version } = splitReference(payload.referenceLabel);
  const referenceColor = payload.referenceColor ?? settings.referenceColor ?? "#f6a623";
  const versionColor = payload.versionColor ?? settings.versionColor ?? "#f6a623";

  return (
    <div className={themeClass} style={style}>
      <div className="projector-background-layer" style={backgroundStyle} />
      {isBackgroundVideo(payload.backgroundImagePath ?? settings.backgroundImagePath) && <video className="projector-background-video" style={{ filter: `brightness(${brightness})` }} src={bg} muted loop autoPlay playsInline />}
      <div className={`projector-inner fade ${visible ? "show" : ""}`} style={fadeStyle}>
        {ref && <header className="projector-ref" style={{ color: referenceColor }}>{ref}</header>}
        <div ref={textRef} className={`projector-body ${payload.blocks.length > 1 ? "dual" : ""}`}>
          {payload.blocks.map((block, i) => (
            <section key={i} className="projector-column">
              {block.label && <div className="projector-col-label">{block.label}</div>}
              <p className="projector-text">{block.text}</p>
            </section>
          ))}
        </div>
        {version && <div className="projector-version" style={{ color: versionColor }}>{version}</div>}
        {payload.copyright && <footer className="projector-copyright">{payload.copyright}</footer>}
      </div>
    </div>
  );
}
