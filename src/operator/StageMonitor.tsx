import { useEffect, useRef, useState } from "react";
import type { MediaFit, ProjectorPayload } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import { backgroundImageUrl } from "@shared/background-image";
import { FadingBackgroundMedia } from "@/components/BackgroundMedia";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  /** Short label shown next to the title, e.g. "16:9 · 1920×1080". */
  ratioLabel?: string;
  /** How background media fills the screen (settings.backgroundFit). */
  backgroundFit?: MediaFit;
  /** How a diapositiva image fills the screen (settings.slideFit). */
  slideFit?: MediaFit;
}

function contentKey(p: ProjectorPayload | null): string {
  if (!p || p.mode === "blank") return "blank";
  if (p.mode === "logo") return `logo:${p.churchName}`;
  return `${p.mode}:${p.referenceLabel}|${p.slideImagePath ?? ""}|${p.blocks.map((b) => `${b.label ?? ""}=${b.text}`).join("|")}`;
}

export function StageMonitor({ title, payload, empty, testId, isLive, aspectRatio, displayWidth, ratioLabel, backgroundFit = DEFAULT_SETTINGS.backgroundFit, slideFit = DEFAULT_SETTINGS.slideFit }: Props) {
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
    if (ms === 0 || contentKey(payload) === contentKey(displayedRef.current)) {
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

  const renderPayload = isLive ? displayed : payload;
  const theme = renderPayload?.theme === "light" ? "light" : "dark";
  const brightness = renderPayload?.brightness ?? 1;
  const projectorFontPx = renderPayload?.fontSize ?? DEFAULT_SETTINGS.fontSize;
  const fadeMs = Math.max(0, renderPayload?.fadeMs ?? DEFAULT_SETTINGS.fadeMs);
  const isLogo = renderPayload?.mode === "logo";
  const projecting = renderPayload?.mode === "verse" || renderPayload?.mode === "slides" || renderPayload?.mode === "logo";
  const label = renderPayload?.referenceLabel ?? "";
  const sep = label.lastIndexOf(" — ");
  const ref = sep < 0 ? label : label.slice(0, sep);
  const version = sep < 0 ? "" : label.slice(sep + 3);
  const referenceColor = renderPayload?.referenceColor ?? "#f6a623";
  const versionColor = renderPayload?.versionColor ?? "#f6a623";
  // Same rule as the projector: slides => solid color background, switched
  // from the incoming payload (not the lagging displayed one) so it fades in
  // parallel with the slide.
  const slidesActive = (isLive ? payload : renderPayload)?.mode === "slides";
  const backgroundPath = slidesActive ? undefined : renderPayload?.backgroundImagePath;
  const backgroundFadeMs = Math.max(0, renderPayload?.backgroundFadeMs ?? DEFAULT_SETTINGS.backgroundFadeMs);
  const pad = renderPayload?.padding ?? DEFAULT_SETTINGS.padding;

  // Scale projector px values down to the miniature screen so type, padding
  // and footer sizes keep the same proportions as the real projector.
  const screenRef = useRef<HTMLDivElement>(null);
  const monitorRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fitPx, setFitPx] = useState(projectorFontPx * 0.16);
  const [scale, setScale] = useState(0.16);
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
      setScale(s);
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

  const copyrightPx = 18 * scale;
  const footerPx = 18 * scale;
  const versionPx = Math.max(18 * scale, Math.min(32 * scale, fitPx * 0.3));
  // The monitor's browser surface has a small extra text-box inset compared
  // with the projector window. Keep the glyphs at the same visual scale so
  // line breaks match after the screen is reduced into the fixed card.
  const bodyFitPx = fitPx * 0.84;

  const slideImage = renderPayload?.mode === "slides" ? renderPayload.slideImagePath ?? null : null;
  const screenContent = (
    <>
      {!renderPayload && empty && <p className="monitor-screen-empty">{empty}</p>}
      {isLogo && <p className="monitor-screen-logo" style={{ fontSize: `${fitPx * 0.65}px` }}>{renderPayload?.churchName}</p>}
      {slideImage && (
        <img src={backgroundImageUrl(slideImage)} alt="" className="monitor-screen-slide" style={{ objectFit: slideFit }} />
      )}
      {renderPayload?.mode === "verse" && (
        <>
          {ref && <header className="monitor-screen-ref" style={{ color: referenceColor, fontSize: `${fitPx * 0.5}px` }}>{ref}</header>}
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
          {(version || renderPayload.copyright) && (
            <div className="monitor-screen-footer">
              {renderPayload.copyright
                ? <footer className="monitor-screen-copyright" style={{ fontSize: `${Number.isFinite(copyrightPx) && copyrightPx > 0 ? copyrightPx : footerPx}px` }}>
                    {renderPayload.copyright}
                  </footer>
                : <span aria-hidden />}
              {version && (
                <div
                  className="monitor-screen-version"
                  style={{ color: versionColor, fontSize: `${versionPx}px` }}
                >
                  {version}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <Card className="monitor-card">
      <CardHeader>
        <CardTitle>
          {isLive && <span className={`live-dot ${projecting ? "on" : ""}`} aria-hidden />}
          {title}
          {ratioLabel && <span className="monitor-ratio" title="Relación real del proyector">{ratioLabel}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="monitor-content">
      <div
        ref={monitorRef}
        className={`monitor ${theme}`}
        data-testid={testId}
      >
        <div
          ref={screenRef}
          className="monitor-screen"
          style={{
            width: screenSize ? `${screenSize.width}px` : "100%",
            height: screenSize ? `${screenSize.height}px` : "auto",
            aspectRatio: screenAspect,
            // A diapositiva image is full-bleed: the text padding must not shrink it.
            padding: slideImage ? 0 : `${pad}%`,
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
          <FadingBackgroundMedia path={backgroundPath} brightness={brightness} fadeMs={backgroundFadeMs} fit={backgroundFit} className="monitor-background-media" />
          <div
            className={`monitor-screen-fade ${!isLive || visible ? "show" : ""}`}
            style={{ transitionDuration: `${fadeMs}ms` }}
          >
            {screenContent}
          </div>
        </div>
      </div>
      </CardContent>
    </Card>
  );
}
