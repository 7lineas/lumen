import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MediaFit, ProjectorPayload } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import { fontStack, type FontFamilyId } from "@shared/fonts";
import { backgroundImageUrl } from "@shared/background-image";
import { payloadContentKey } from "@shared/stage";
import { FadingBackgroundMedia } from "@/components/BackgroundMedia";
import { CountdownClock, ElapsedClock } from "@/components/Clock";
import { SyncedVideo } from "@/components/SyncedVideo";
import { VerseScreen } from "@/components/VerseScreen";

interface Props {
  title: string;
  payload: ProjectorPayload | null;
  empty?: string;
  testId?: string;
  isLive?: boolean;
  aspectRatio?: number;
  displayWidth?: number;
  label?: string;
  ratioLabel?: string;
  children?: ReactNode;
  onVideoDuration?: (seconds: number) => void;
  backgroundFit?: MediaFit;
  slideFit?: MediaFit;
  liveSince?: number | null;
  fontFamily?: FontFamilyId;
}

export function StageMonitor({
  title,
  payload,
  empty,
  testId,
  isLive,
  aspectRatio,
  displayWidth,
  label,
  ratioLabel,
  children,
  onVideoDuration,
  backgroundFit = DEFAULT_SETTINGS.backgroundFit,
  slideFit = DEFAULT_SETTINGS.slideFit,
  liveSince,
  fontFamily = DEFAULT_SETTINGS.fontFamily,
}: Props) {
  const screenAspect =
    Number.isFinite(aspectRatio) && (aspectRatio ?? 0) > 0
      ? aspectRatio!
      : 16 / 9;
  const projectorW = displayWidth && displayWidth > 0 ? displayWidth : 1920;
  const [displayed, setDisplayed] = useState(payload);
  const [visible, setVisible] = useState(true);
  const displayedRef = useRef(payload);
  const visibleRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const [fadeMsNow, setFadeMsNow] = useState<number | null>(null);

  useEffect(() => {
    if (!isLive) {
      displayedRef.current = payload;
      setDisplayed(payload);
      return;
    }
    const ms = Math.max(
      0,
      payload?.fadeMs ??
        displayedRef.current?.fadeMs ??
        DEFAULT_SETTINGS.fadeMs,
    );
    setFadeMsNow(ms);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (
      ms === 0 ||
      payloadContentKey(payload) === payloadContentKey(displayedRef.current)
    ) {
      displayedRef.current = payload;
      setDisplayed(payload);
      if (!visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }
      return;
    }
    if (!visibleRef.current) {
      displayedRef.current = payload;
      setDisplayed(payload);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          visibleRef.current = true;
          setVisible(true);
        });
      });
      return;
    }
    visibleRef.current = false;
    setVisible(false);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      displayedRef.current = payload;
      setDisplayed(payload);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          visibleRef.current = true;
          setVisible(true);
        });
      });
    }, ms);
  }, [payload, isLive]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const takeKey = useRef<string | null>(null);
  useEffect(() => {
    if (!isLive) return;
    const key = payloadContentKey(payload);
    if (key === takeKey.current) return;
    takeKey.current = key;
    const el = monitorRef.current;
    if (key === "blank" || !el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { boxShadow: "inset 0 0 0 0 rgba(255, 59, 48, 0)" },
        { boxShadow: "inset 0 0 0 3px rgba(255, 59, 48, 0.9)", offset: 0.25 },
        { boxShadow: "inset 0 0 0 0 rgba(255, 59, 48, 0)" },
      ],
      { duration: 700, easing: "ease-out" },
    );
  }, [payload, isLive]);

  const renderPayload = isLive ? displayed : payload;
  const monitorFontFamily = renderPayload?.fontFamily ?? fontFamily;
  const theme = renderPayload?.theme === "light" ? "light" : "dark";
  const brightness = renderPayload?.brightness ?? 1;
  const projectorFontPx = renderPayload?.fontSize ?? DEFAULT_SETTINGS.fontSize;
  const fadeMs = Math.max(
    0,
    (isLive ? fadeMsNow : null) ??
      renderPayload?.fadeMs ??
      DEFAULT_SETTINGS.fadeMs,
  );
  const isLogo = renderPayload?.mode === "logo";
  const projecting = renderPayload != null && renderPayload.mode !== "blank";
  const referenceColor = renderPayload?.referenceColor ?? "#f6a623";
  const versionColor = renderPayload?.versionColor ?? "#f6a623";
  const incomingMode = (isLive ? payload : renderPayload)?.mode;
  const slidesActive = incomingMode === "slides" || incomingMode === "video";
  const backgroundPath = isLogo
    ? renderPayload?.logoImagePath
    : slidesActive
      ? undefined
      : renderPayload?.backgroundImagePath;
  const backgroundFadeMs = Math.max(
    0,
    renderPayload?.backgroundFadeMs ?? DEFAULT_SETTINGS.backgroundFadeMs,
  );
  const pad = renderPayload?.padding ?? DEFAULT_SETTINGS.padding;

  const screenRef = useRef<HTMLDivElement>(null);
  const monitorRef = useRef<HTMLDivElement>(null);
  const [screenSize, setScreenSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [screenInnerWidth, setScreenInnerWidth] = useState(0);
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen || typeof ResizeObserver === "undefined") return;
    const measure = () => setScreenInnerWidth(screen.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(screen);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const monitor = monitorRef.current;
    if (!monitor) return;
    const measure = () => {
      const width = monitor.clientWidth || 1;
      const height = monitor.clientHeight || 1;
      const screenWidth = Math.min(width, height * screenAspect);
      const screenHeight = screenWidth / screenAspect;
      setScreenSize((previous) =>
        previous &&
        Math.abs(previous.width - screenWidth) < 0.5 &&
        Math.abs(previous.height - screenHeight) < 0.5
          ? previous
          : { width: screenWidth, height: screenHeight },
      );
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(monitor);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [screenAspect]);

  const slideImage =
    renderPayload?.mode === "slides"
      ? (renderPayload.slideImagePath ?? null)
      : null;
  const video =
    renderPayload?.mode === "video" ? (renderPayload.video ?? null) : null;
  const fullBleed = slideImage != null || video != null;
  const screenContent = (
    <>
      {!renderPayload && empty && (
        <p className="monitor-screen-empty">{empty}</p>
      )}
      {slideImage && (
        <img
          src={backgroundImageUrl(slideImage)}
          alt=""
          className="monitor-screen-slide"
          style={{ objectFit: slideFit }}
        />
      )}
      {video && (
        <SyncedVideo
          playback={video}
          muted
          still
          fit={slideFit}
          className="monitor-screen-slide"
          onDuration={onVideoDuration}
        />
      )}
      {video?.playing && (
        <span className="monitor-video-note">Reproduciendo en la pantalla</span>
      )}
      {renderPayload?.mode === "countdown" && renderPayload.countdown && (
        <div className="monitor-countdown">
          {renderPayload.countdown.caption && (
            <p className="monitor-countdown-caption">
              {renderPayload.countdown.caption}
            </p>
          )}
          <p className="monitor-countdown-time">
            <CountdownClock endsAt={renderPayload.countdown.endsAt} />
          </p>
        </div>
      )}
      {renderPayload?.mode === "verse" && screenInnerWidth > 0 && (
        <div
          className="monitor-replica"
          style={{
            width: `${projectorW}px`,
            height: `${projectorW / screenAspect}px`,
            padding: `${(pad / 100) * projectorW}px`,
            transform: `scale(${screenInnerWidth / projectorW})`,
          }}
        >
          <VerseScreen
            payload={renderPayload}
            fontSize={projectorFontPx}
            fitKey={`${monitorFontFamily}|${renderPayload.fontWeight ?? ""}|${projectorW}|${screenAspect}`}
            className="projector-inner show"
            style={{ transition: "none" }}
            referenceColor={referenceColor}
            versionColor={versionColor}
          />
        </div>
      )}
    </>
  );

  return (
    <section className={isLive ? "lx-mon-sec live" : "lx-mon-sec"}>
      <header>
        <span className={isLive ? "lx-mon-tag live" : "lx-mon-tag"}>
          {isLive && (
            <span className={`lx-dot${projecting ? " on" : ""}`} aria-hidden />
          )}
          {title}
        </span>
        <span className="lx-mon-label" title={label}>
          {label}
        </span>
        {isLive &&
          liveSince != null &&
          (renderPayload?.mode === "verse" ||
            renderPayload?.mode === "slides" ||
            renderPayload?.mode === "video") && (
            <ElapsedClock
              since={liveSince}
              className="lx-mon-time"
              title="Tiempo en pantalla con este contenido"
            />
          )}
        {ratioLabel && (
          <span className="lx-mon-time" title="Relación real del proyector">
            {ratioLabel}
          </span>
        )}
      </header>
      <div
        ref={monitorRef}
        className={`monitor ${theme}`}
        data-testid={testId}
        style={{ aspectRatio: screenAspect }}
      >
        <div
          ref={screenRef}
          className="monitor-screen"
          style={{
            width: screenSize ? `${screenSize.width}px` : "100%",
            height: screenSize ? `${screenSize.height}px` : "auto",
            aspectRatio: screenAspect,
            fontFamily: fontStack(monitorFontFamily),
            fontWeight: renderPayload?.fontWeight,
            padding:
              fullBleed || renderPayload?.mode === "verse" ? 0 : `${pad}%`,
          }}
        >
          <div
            className="monitor-background-layer"
            style={{
              background:
                renderPayload?.backgroundColor ??
                (!renderPayload ? "#000" : undefined),
              transition: `background-color ${backgroundFadeMs}ms ease`,
              filter: `brightness(${brightness})`,
            }}
          />
          <FadingBackgroundMedia
            path={backgroundPath}
            brightness={brightness}
            fadeMs={backgroundFadeMs}
            fit={isLogo ? "cover" : backgroundFit}
            className="monitor-background-media"
            still
          />
          <div
            className={`monitor-screen-fade ${!isLive || visible ? "show" : ""}`}
            style={{ transitionDuration: `${fadeMs}ms` }}
          >
            {screenContent}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}
