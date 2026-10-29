import { useEffect, useRef, useState } from "react";
import type { AppSettings, ProjectorPayload } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import { backgroundImageUrl } from "@shared/background-image";
import { fontStack } from "@shared/fonts";
import { payloadContentKey } from "@shared/stage";
import { FadingBackgroundMedia } from "@/components/BackgroundMedia";
import { CountdownClock } from "@/components/Clock";
import { SyncedVideo } from "@/components/SyncedVideo";
import { VerseScreen } from "@/components/VerseScreen";

const EMPTY: ProjectorPayload = {
  mode: "blank",
  referenceLabel: "",
  blocks: [],
  churchName: DEFAULT_SETTINGS.churchName,
  fontSize: DEFAULT_SETTINGS.fontSize,
  brightness: 1,
  padding: DEFAULT_SETTINGS.padding,
  theme: "dark",
  backgroundColor: DEFAULT_SETTINGS.backgroundColor,
};

export function ProjectorView() {
  // `payload` is what is currently displayed (lags behind incoming updates
  // during the fade-out phase so the old content can fade instead of cutting).
  const [payload, setPayload] = useState<ProjectorPayload>(EMPTY);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [visible, setVisible] = useState(false);
  // True as soon as a slides payload arrives (and false as soon as anything
  // else does), without waiting for the content fade: the background must
  // change to solid color / back to media in parallel with the slide fade.
  const [slidesActive, setSlidesActive] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const displayedRef = useRef<ProjectorPayload>(EMPTY);
  const visibleRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  // Duration of the fade in progress. The fade-out of the old content must
  // last as long as the timer that swaps in the new one (whose fadeMs wins),
  // or the new text lands on top of a half-faded old one.
  const [fadeMsNow, setFadeMsNow] = useState<number | null>(null);

  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    void api
      .getSettings()
      .then((s) => setSettings({ ...DEFAULT_SETTINGS, ...s }));
    const offSettings = api.onSettingsUpdate?.((s) =>
      setSettings({ ...DEFAULT_SETTINGS, ...s }),
    );
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
      setSlidesActive(p.mode === "slides" || p.mode === "video");
      const ms = Math.max(
        0,
        p.fadeMs ?? settingsRef.current.fadeMs ?? DEFAULT_SETTINGS.fadeMs,
      );
      setFadeMsNow(ms);
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
      if (payloadContentKey(p) === payloadContentKey(displayedRef.current)) {
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
  // Songs and texts can bring their own typeface; everything else uses Ajustes.
  const fontFamily = payload.fontFamily ?? settings.fontFamily;

  const themeClass =
    (payload.theme ?? settings.theme) === "light"
      ? "projector light"
      : "projector dark";
  const brightness = payload.brightness ?? settings.brightness ?? 1;
  const fadeMs =
    fadeMsNow ?? payload.fadeMs ?? settings.fadeMs ?? DEFAULT_SETTINGS.fadeMs;
  const fadeStyle: React.CSSProperties = {
    transitionDuration: `${Math.max(0, fadeMs)}ms`,
  };
  // Background media is an application setting, so it must stay identical to
  // the operator's preview/live monitors even when the last payload was sent
  // before the user changed the selected image or video.
  // While slides are shown the background is always the solid color (the
  // media fades out over backgroundFadeMs and fades back in when they hide).
  const backgroundPath = slidesActive
    ? undefined
    : settings.backgroundImagePath;
  const backgroundFadeMs = Math.max(
    0,
    payload.backgroundFadeMs ??
      settings.backgroundFadeMs ??
      DEFAULT_SETTINGS.backgroundFadeMs,
  );
  const backgroundMedia = (
    <FadingBackgroundMedia
      path={backgroundPath}
      brightness={brightness}
      fadeMs={backgroundFadeMs}
      fit={settings.backgroundFit ?? DEFAULT_SETTINGS.backgroundFit}
      className="projector-background-media"
    />
  );
  const style: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    fontFamily: fontStack(fontFamily),
    fontWeight: payload.fontWeight,
    padding: `${payload.padding ?? settings.padding ?? DEFAULT_SETTINGS.padding}vw`,
  };
  const backgroundStyle: React.CSSProperties = {
    backgroundColor: payload.backgroundColor || settings.backgroundColor,
    transition: `background-color ${backgroundFadeMs}ms ease`,
    filter: `brightness(${brightness})`,
  };

  if (payload.mode === "blank") {
    // "Limpiar" clears text only: keep the background color and media
    // visible behind an empty screen.
    return (
      <div className={themeClass} style={style}>
        <div className="projector-background-layer" style={backgroundStyle} />
        {backgroundMedia}
      </div>
    );
  }

  if (payload.mode === "countdown") {
    const countdown = payload.countdown;
    return (
      <div className={themeClass} style={style}>
        <div className="projector-background-layer" style={backgroundStyle} />
        {backgroundMedia}
        <div
          className={`projector-inner projector-countdown fade ${visible ? "show" : ""}`}
          style={fadeStyle}
        >
          {countdown?.caption && (
            <p className="projector-countdown-caption">{countdown.caption}</p>
          )}
          <p className="projector-countdown-time">
            {countdown ? <CountdownClock endsAt={countdown.endsAt} /> : "00:00"}
          </p>
        </div>
      </div>
    );
  }

  if (payload.mode === "video" && payload.video) {
    return (
      // Full-bleed like a slide, with the sound: this is the only window that is not muted.
      <div className={themeClass} style={{ ...style, padding: 0 }}>
        <div className="projector-background-layer" style={backgroundStyle} />
        {backgroundMedia}
        <div
          className={`projector-inner projector-inner-slide fade ${visible ? "show" : ""}`}
          style={fadeStyle}
        >
          <SyncedVideo
            playback={payload.video}
            muted={false}
            fit={settings.slideFit ?? DEFAULT_SETTINGS.slideFit}
            className="projector-slide"
          />
        </div>
      </div>
    );
  }

  if (payload.mode === "logo") {
    // The logo is shown like a fondo: same layer, brightness and fade, covering the screen.
    return (
      <div className={themeClass} style={style}>
        <div className="projector-background-layer" style={backgroundStyle} />
        <FadingBackgroundMedia
          path={payload.logoImagePath ?? settings.logoImagePath}
          brightness={brightness}
          fadeMs={backgroundFadeMs}
          fit="cover"
          className="projector-background-media"
        />
      </div>
    );
  }

  // Settings saved before the accent-color split still carry the legacy keys.
  const legacyColors = settings as Partial<AppSettings> & {
    referenceColor?: string;
    versionColor?: string;
  };
  const referenceColor =
    payload.referenceColor ??
    settings.accentColor ??
    legacyColors.referenceColor ??
    "#f6a623";
  const versionColor =
    payload.versionColor ??
    settings.accentColor ??
    legacyColors.versionColor ??
    "#f6a623";

  const slideImage =
    payload.mode === "slides" ? (payload.slideImagePath ?? null) : null;
  const slideImageUrl = slideImage
    ? (backgroundImageUrl(slideImage) ?? undefined)
    : undefined;

  if (slideImage && slideImageUrl) {
    return (
      // A diapositiva is full-bleed: no content padding / max width, so
      // "Cubrir" and "Ajustar" are relative to the whole screen (same as the monitors).
      <div className={themeClass} style={{ ...style, padding: 0 }}>
        <div className="projector-background-layer" style={backgroundStyle} />
        {backgroundMedia}
        <div
          className={`projector-inner projector-inner-slide fade ${visible ? "show" : ""}`}
          style={fadeStyle}
        >
          <img
            src={slideImageUrl}
            alt=""
            className="projector-slide"
            style={{
              objectFit: settings.slideFit ?? DEFAULT_SETTINGS.slideFit,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={themeClass} style={style}>
      <div className="projector-background-layer" style={backgroundStyle} />
      {backgroundMedia}
      <VerseScreen
        payload={payload}
        fontSize={fontSize}
        fitKey={`${fontFamily}|${payload.fontWeight ?? ""}`}
        className={`projector-inner fade ${visible ? "show" : ""}`}
        style={fadeStyle}
        referenceColor={referenceColor}
        versionColor={versionColor}
      />
    </div>
  );
}
