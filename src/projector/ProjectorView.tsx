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
    const offSettings = api.onSettingsUpdate?.((s) => setSettings({ ...DEFAULT_SETTINGS, ...s }));
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
      offSettings?.();
    };
  }, []);

  const fontSize = payload.fontSize || settings.fontSize;

  useEffect(() => {
    const el = textRef.current;
    if (!el || payload.mode !== "verse") return;
    let raf = 0;
    const fit = () => {
      // Always restart from the full size so growing the window grows text back.
      let size = fontSize;
      el.style.fontSize = `${size}px`;
      // The body is a flex-1 box with overflow hidden, so fitting to its own
      // clientHeight keeps header/footer clear at any window ratio.
      let guard = 500;
      while (guard-- > 0 && size > 28 && el.scrollHeight > el.clientHeight) {
        size -= 2;
        el.style.fontSize = `${size}px`;
      }
      setFitSize(size);
    };
    fit();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };
    window.addEventListener("resize", onResize);
    // Webfonts arriving late change metrics; refit once they're ready.
    let fontsDone = false;
    try {
      void document.fonts?.ready.then(() => {
        if (!fontsDone) {
          fontsDone = true;
          fit();
        }
      }).catch(() => undefined);
    } catch {
      // ignore
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [payload, fontSize]);

  const themeClass = (payload.theme ?? settings.theme) === "light" ? "projector light" : "projector dark";
  const brightness = payload.brightness ?? settings.brightness ?? 1;
  const fadeMs = payload.fadeMs ?? settings.fadeMs ?? DEFAULT_SETTINGS.fadeMs;
  const fadeStyle: React.CSSProperties = { transitionDuration: `${Math.max(0, fadeMs)}ms` };
  // Background media is an application setting, so it must stay identical to
  // the operator's preview/live monitors even when the last payload was sent
  // before the user changed the selected image or video.
  const backgroundPath = settings.backgroundImagePath;
  const bg = backgroundImageUrl(backgroundPath);
  const backgroundVideo = isBackgroundVideo(backgroundPath);
  const style: React.CSSProperties = {
    fontSize: `${fitSize}px`,
    padding: `${payload.padding ?? settings.padding ?? DEFAULT_SETTINGS.padding}vw`,
  };
  const backgroundStyle: React.CSSProperties = {
    backgroundColor: payload.backgroundColor || settings.backgroundColor,
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
        {bg && !backgroundVideo && <img className="projector-background-media" style={{ filter: `brightness(${brightness})` }} src={bg} alt="" aria-hidden />}
        {backgroundVideo && <video className="projector-background-media" style={{ filter: `brightness(${brightness})` }} src={bg} muted loop autoPlay playsInline preload="auto" onCanPlay={(event) => { void event.currentTarget.play().catch(() => undefined); }} />}
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
      {bg && !backgroundVideo && <img className="projector-background-media" style={{ filter: `brightness(${brightness})` }} src={bg} alt="" aria-hidden />}
      {backgroundVideo && <video className="projector-background-media" style={{ filter: `brightness(${brightness})` }} src={bg} muted loop autoPlay playsInline preload="auto" onCanPlay={(event) => { void event.currentTarget.play().catch(() => undefined); }} />}
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
        {(version || payload.copyright) && (
          <div className="projector-footer">
            {payload.copyright
              ? <footer className="projector-copyright">{payload.copyright}</footer>
              : <span aria-hidden />}
            {version && <div className="projector-version" style={{ color: versionColor }}>{version}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
