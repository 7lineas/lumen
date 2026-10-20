import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MediaFit, ProjectorPayload } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import { backgroundImageUrl } from "@shared/background-image";
import { payloadContentKey } from "@shared/stage";
import { FadingBackgroundMedia } from "@/components/BackgroundMedia";
import { CountdownClock, ElapsedClock } from "@/components/Clock";
import { SyncedVideo } from "@/components/SyncedVideo";

interface Props {
  title: string;
  payload: ProjectorPayload | null;
  /** Hint shown only when there is truly no payload (e.g. preview with
   *  nothing staged). The live monitor omits it: the background is
   *  permanent, so something is always projecting. */
  empty?: string;
  testId?: string;
  isLive?: boolean;
  /** Numeric width / height ratio matching the real projector content bounds. */
  aspectRatio?: number;
  /** Real projector display width in px, used to scale fonts proportionally. */
  displayWidth?: number;
  /** What is on this screen ("Juan 3:16", "Coro"), next to the title. */
  label?: string;
  /** Short note at the right of the header, e.g. "16:9 · 1920×1080". */
  ratioLabel?: string;
  /** Controls under the screen. */
  children?: ReactNode;
  /** Length of the video on this screen, once it is known. */
  onVideoDuration?: (seconds: number) => void;
  /** How background media fills the screen (settings.backgroundFit). */
  backgroundFit?: MediaFit;
  /** How a diapositiva image fills the screen (settings.slideFit). */
  slideFit?: MediaFit;
  /** When the live content last changed (epoch ms); shown as the time on screen. */
  liveSince?: number | null;
}

export function StageMonitor({ title, payload, empty, testId, isLive, aspectRatio, displayWidth, label, ratioLabel, children, onVideoDuration, backgroundFit = DEFAULT_SETTINGS.backgroundFit, slideFit = DEFAULT_SETTINGS.slideFit, liveSince }: Props) {
  // Live monitor mirrors the projector: fade out old content, swap, fade in.
  // Preview renders instantly (no fade).
  // The inner screen renders at the real projector aspect ratio so the
  // operator sees the same framing as the congregation.
  const screenAspect = Number.isFinite(aspectRatio) && (aspectRatio ?? 0) > 0 ? aspectRatio! : 16 / 9;
  const projectorW = displayWidth && displayWidth > 0 ? displayWidth : 1920;
  const [displayed, setDisplayed] = useState(payload);
  const [visible, setVisible] = useState(true);
  const displayedRef = useRef(payload);
  const visibleRef = useRef(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isLive) {
      displayedRef.current = payload;
      setDisplayed(payload);
      return;
    }
    const ms = Math.max(0, payload?.fadeMs ?? displayedRef.current?.fadeMs ?? DEFAULT_SETTINGS.fadeMs);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (ms === 0 || payloadContentKey(payload) === payloadContentKey(displayedRef.current)) {
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

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  // "Take" flash: the live monitor pulses an on-air ring whenever new content
  // is projected. Web Animations restarts on every take, even back-to-back.
  // Style-only updates and "Limpiar" do not flash.
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
  const theme = renderPayload?.theme === "light" ? "light" : "dark";
  const brightness = renderPayload?.brightness ?? 1;
  const projectorFontPx = renderPayload?.fontSize ?? DEFAULT_SETTINGS.fontSize;
  const fadeMs = Math.max(0, renderPayload?.fadeMs ?? DEFAULT_SETTINGS.fadeMs);
  const isLogo = renderPayload?.mode === "logo";
  const projecting = renderPayload != null && renderPayload.mode !== "blank";
  const referenceLabel = renderPayload?.referenceLabel ?? "";
  const sep = referenceLabel.lastIndexOf(" — ");
  const ref = sep < 0 ? referenceLabel : referenceLabel.slice(0, sep);
  const version = sep < 0 ? "" : referenceLabel.slice(sep + 3);
  const referenceColor = renderPayload?.referenceColor ?? "#f6a623";
  const versionColor = renderPayload?.versionColor ?? "#f6a623";
  // Same rule as the projector: slides => solid color background, switched
  // from the incoming payload (not the lagging displayed one) so it fades in
  // parallel with the slide.
  const incomingMode = (isLive ? payload : renderPayload)?.mode;
  const slidesActive = incomingMode === "slides" || incomingMode === "video";
  // The logo takes the fondo's place (covering), as on the projector.
  const backgroundPath = isLogo ? renderPayload?.logoImagePath : slidesActive ? undefined : renderPayload?.backgroundImagePath;
  const backgroundFadeMs = Math.max(0, renderPayload?.backgroundFadeMs ?? DEFAULT_SETTINGS.backgroundFadeMs);
  const pad = renderPayload?.padding ?? DEFAULT_SETTINGS.padding;

  // Scale projector px values down to the miniature screen so type, padding
  // and footer sizes keep the same proportions as the real projector.
  const screenRef = useRef<HTMLDivElement>(null);
  const monitorRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fitPx, setFitPx] = useState(projectorFontPx * 0.16);
  const [screenSize, setScreenSize] = useState<{ width: number; height: number } | null>(null);

  // The card is a fixed-height monitor viewport. Fit the simulated projector
  // screen inside it instead of allowing the aspect ratio to determine the
  // card's height.
  useEffect(() => {
    const monitor = monitorRef.current;
    if (!monitor) return;
    const measure = () => {
      const width = monitor.clientWidth || 1;
      const height = monitor.clientHeight || 1;
      const screenWidth = Math.min(width, height * screenAspect);
      const screenHeight = screenWidth / screenAspect;
      setScreenSize((previous) => (
        previous && Math.abs(previous.width - screenWidth) < 0.5 && Math.abs(previous.height - screenHeight) < 0.5
          ? previous
          : { width: screenWidth, height: screenHeight }
      ));
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

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const fit = () => {
      const w = screen.clientWidth || 1;
      // ProjectorView renders its text inside the padded content box. Scale
      // from that same box instead of the monitor's outer frame; otherwise
      // the preview uses a smaller font and wraps at different words.
      const bodyWidth = textRef.current?.clientWidth || w;
      const projectorContentWidth = Math.min(
        projectorW * Math.max(0.1, 1 - (2 * pad) / 100),
        1600,
      );
      const s = bodyWidth / Math.max(1, projectorContentWidth);
      // Always restart from the full size so growing the window grows text back.
      let size = projectorFontPx * s;
      const el = textRef.current;
      if (el && renderPayload?.mode === "verse") {
        el.style.fontSize = `${size}px`;
        // Same rule as the projector: the body is a flex-1 box with overflow
        // hidden, so fitting to its own clientHeight keeps header/footer
        // clear at any window ratio.
        const min = Math.max(4, 28 * s);
        const step = Math.max(0.5, 2 * s);
        let guard = 200;
        while (guard-- > 0 && size > min && el.scrollHeight > el.clientHeight) {
          size -= step;
          el.style.fontSize = `${size}px`;
        }
      }
      setFitPx(size);
    };
    fit();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(fit);
      ro.observe(screen);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [renderPayload, projectorFontPx, projectorW, screenAspect, pad]);

  // The monitor's browser surface has a small extra text-box inset compared
  // with the projector window. Keep the glyphs at the same visual scale so
  // line breaks match after the screen is reduced into the fixed card.
  const bodyFitPx = fitPx * 0.84;
  // Floating labels (reference top-left, version® bottom-right) share one
  // size: 3/4 of the verse text.
  const metaPx = bodyFitPx * 0.75;

  const slideImage = renderPayload?.mode === "slides" ? renderPayload.slideImagePath ?? null : null;
  const video = renderPayload?.mode === "video" ? renderPayload.video ?? null : null;
  const fullBleed = slideImage != null || video != null;
  const screenContent = (
    <>
      {!renderPayload && empty && <p className="monitor-screen-empty">{empty}</p>}
      {slideImage && (
        <img src={backgroundImageUrl(slideImage)} alt="" className="monitor-screen-slide" style={{ objectFit: slideFit }} />
      )}
      {video && (
        // A still frame: only the projector plays the video (see SyncedVideo's `still`).
        <SyncedVideo playback={video} muted still fit={slideFit} className="monitor-screen-slide" onDuration={onVideoDuration} />
      )}
      {video?.playing && <span className="monitor-video-note">Reproduciendo en la pantalla</span>}
      {renderPayload?.mode === "countdown" && renderPayload.countdown && (
        // Container units keep the miniature in the same proportions as the
        // projector's vw/vh sizes.
        <div className="monitor-countdown">
          {renderPayload.countdown.caption && <p className="monitor-countdown-caption">{renderPayload.countdown.caption}</p>}
          <p className="monitor-countdown-time"><CountdownClock endsAt={renderPayload.countdown.endsAt} /></p>
        </div>
      )}
      {renderPayload?.mode === "verse" && (
        <>
          {ref && <header className="monitor-screen-ref" style={{ color: referenceColor, fontSize: `${metaPx}px` }}>{ref}</header>}
          <div
            ref={textRef}
            className={`monitor-screen-body ${renderPayload.blocks.length > 1 ? "dual" : ""}`}
            style={{ fontSize: `${bodyFitPx}px` }}
          >
            {renderPayload.blocks.map((block, i) => (
              <section key={i} className="monitor-screen-column">
                {block.label && <div className="monitor-screen-col-label">{block.label}</div>}
                <p className="monitor-screen-text">{block.text}</p>
              </section>
            ))}
          </div>
          {version && (
            <div className="monitor-screen-footer">
              <div
                className="monitor-screen-version"
                style={{ color: versionColor, fontSize: `${metaPx}px` }}
              >
                {version}®
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <section className={isLive ? "lx-mon-sec live" : "lx-mon-sec"}>
      <header>
        <span className={isLive ? "lx-mon-tag live" : "lx-mon-tag"}>
          {isLive && <span className={`lx-dot${projecting ? " on" : ""}`} aria-hidden />}
          {title}
        </span>
        <span className="lx-mon-label" title={label}>{label}</span>
        {isLive && liveSince != null && (renderPayload?.mode === "verse" || renderPayload?.mode === "slides" || renderPayload?.mode === "video") && (
          <ElapsedClock since={liveSince} className="lx-mon-time" title="Tiempo en pantalla con este contenido" />
        )}
        {ratioLabel && <span className="lx-mon-time" title="Relación real del proyector">{ratioLabel}</span>}
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
            // A slide image or a video is full-bleed: the text padding must not shrink it.
            padding: fullBleed ? 0 : `${pad}%`,
          }}
        >
          <div
            className="monitor-background-layer"
            style={{
              background: renderPayload?.backgroundColor ?? (!renderPayload ? "#000" : undefined),
              transition: `background-color ${backgroundFadeMs}ms ease`,
              filter: `brightness(${brightness})`,
            }}
          />
          <FadingBackgroundMedia path={backgroundPath} brightness={brightness} fadeMs={backgroundFadeMs} fit={isLogo ? "cover" : backgroundFit} className="monitor-background-media" />
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
