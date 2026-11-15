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

function imageReady(p: ProjectorPayload): Promise<void> {
  const url =
    p.mode === "slides" && p.slideImagePath
      ? backgroundImageUrl(p.slideImagePath)
      : undefined;
  if (!url) return Promise.resolve();
  const image = new Image();
  image.src = url;
  return Promise.race([
    image.decode().catch(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
  ]);
}

export function ProjectorView() {
  const [payload, setPayload] = useState<ProjectorPayload>(EMPTY);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [visible, setVisible] = useState(false);
  const [slidesActive, setSlidesActive] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const displayedRef = useRef<ProjectorPayload>(EMPTY);
  const visibleRef = useRef(false);
  const timerRef = useRef<number | null>(null);
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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => show(p.mode !== "blank"));
      });
    };
    let swapToken = 0;
    const off = api.onProjectorUpdate((p) => {
      const token = ++swapToken;
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
      if (payloadContentKey(p) === payloadContentKey(displayedRef.current)) {
        displayedRef.current = p;
        setPayload(p);
        if (p.mode !== "blank" && !visibleRef.current) show(true);
        return;
      }
      if (!visibleRef.current || displayedRef.current.mode === "blank") {
        show(false);
        void imageReady(p).then(() => {
          if (token !== swapToken) return;
          displayedRef.current = p;
          setPayload(p);
          fadeIn(p);
        });
        return;
      }
      show(false);
      const ready = imageReady(p);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void ready.then(() => {
          if (token !== swapToken) return;
          displayedRef.current = p;
          setPayload(p);
          fadeIn(p);
        });
      }, ms);
    });
    return () => {
      swapToken++;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      off?.();
      offSettings?.();
    };
  }, []);

  const fontSize = payload.fontSize || settings.fontSize;
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
    filter: brightness === 1 ? undefined : `brightness(${brightness})`,
  };

  if (payload.mode === "blank") {
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
