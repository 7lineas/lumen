import { useEffect, useRef, useState } from "react";
import type { ProjectorPayload } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";
import { backgroundImageUrl, isBackgroundVideo } from "@shared/background-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: string;
  payload: ProjectorPayload | null;
  empty: string;
  testId?: string;
  isLive?: boolean;
  /** CSS aspect-ratio value (e.g. "16 / 9") matching the real projector display. */
  aspectRatio?: string;
  /** Real projector display width in px, used to scale fonts proportionally. */
  displayWidth?: number;
  /** Real projector display height in px, used for fixed-px footer scaling. */
  displayHeight?: number;
  /** Short label shown next to the title, e.g. "16:9 · 1920×1080". */
  ratioLabel?: string;
}

function contentKey(p: ProjectorPayload | null): string {
  if (!p || p.mode === "blank") return "blank";
  if (p.mode === "logo") return `logo:${p.churchName}`;
  return `verse:${p.referenceLabel}|${p.blocks.map((b) => `${b.label ?? ""}=${b.text}`).join("|")}`;
}

export function StageMonitor({ title, payload, empty, testId, isLive, aspectRatio, displayWidth, displayHeight, ratioLabel }: Props) {
  // Live monitor mirrors the projector: fade out old content, swap, fade in.
  // Preview renders instantly (no fade).
  // The inner screen renders at the real projector aspect ratio so the
  // operator sees the same framing as the congregation.
  const screenAspect = aspectRatio ?? "16 / 9";
  const projectorW = displayWidth && displayWidth > 0 ? displayWidth : 1920;
  const projectorH = displayHeight && displayHeight > 0 ? displayHeight : 1080;
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
  const isBlank = !renderPayload || renderPayload.mode === "blank";
  const isLogo = renderPayload?.mode === "logo";
  const projecting = renderPayload?.mode === "verse" || renderPayload?.mode === "logo";
  const label = renderPayload?.referenceLabel ?? "";
  const sep = label.lastIndexOf(" — ");
  const ref = sep < 0 ? label : label.slice(0, sep);
  const version = sep < 0 ? "" : label.slice(sep + 3);
  const referenceColor = renderPayload?.referenceColor ?? "#f6a623";
  const versionColor = renderPayload?.versionColor ?? "#f6a623";
  const bg = backgroundImageUrl(renderPayload?.backgroundImagePath);
  const pad = renderPayload?.padding ?? DEFAULT_SETTINGS.padding;

  // Scale projector px values down to the miniature screen so type, padding
  // and footer sizes keep the same proportions as the real projector.
  const screenRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fitPx, setFitPx] = useState(projectorFontPx * 0.16);
  const [scale, setScale] = useState(0.16);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const fit = () => {
      const w = screen.clientWidth || 1;
      const h = screen.clientHeight || 1;
      const s = w / projectorW;
      setScale(s);
      let size = projectorFontPx * s;
      const el = textRef.current;
      if (el && renderPayload?.mode === "verse") {
        el.style.fontSize = `${size}px`;
        const min = Math.max(4, 28 * s);
        const step = Math.max(0.5, 2 * s);
        let guard = 200;
        while (guard-- > 0 && size > min && el.scrollHeight > h * 0.72) {
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
  }, [renderPayload, projectorFontPx, projectorW, screenAspect]);

  const copyrightPx = (18 / projectorH) * (screenRef.current?.clientHeight || projectorH * scale) || 18 * scale;
  const footerPx = 18 * scale;
  const versionMinPx = 18 * scale;
  const versionMaxPx = 32 * scale;

  const screenContent = (
    <>
      {isBlank && <p className="monitor-screen-empty">{empty}</p>}
      {isLogo && <p className="monitor-screen-logo" style={{ fontSize: `${fitPx * 0.65}px` }}>{renderPayload?.churchName}</p>}
      {renderPayload?.mode === "verse" && (
        <>
          {ref && <header className="monitor-screen-ref" style={{ color: referenceColor, fontSize: `${fitPx * 0.5}px` }}>{ref}</header>}
          <div
            ref={textRef}
            className={`monitor-screen-body ${renderPayload.blocks.length > 1 ? "dual" : ""}`}
            style={{ fontSize: `${fitPx}px` }}
          >
            {renderPayload.blocks.map((block, i) => (
              <section key={i} className="monitor-screen-column">
                {block.label && <div className="monitor-screen-col-label">{block.label}</div>}
                <p className="monitor-screen-text">{block.text}</p>
              </section>
            ))}
          </div>
          {version && (
            <div
              className="monitor-screen-version"
              style={{ color: versionColor, fontSize: `clamp(${versionMinPx}px, 0.3em, ${versionMaxPx}px)` }}
            >
              {version}
            </div>
          )}
          {renderPayload.copyright && (
            <footer className="monitor-screen-copyright" style={{ fontSize: `${Number.isFinite(copyrightPx) && copyrightPx > 0 ? copyrightPx : footerPx}px` }}>
              {renderPayload.copyright}
            </footer>
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
        className={`monitor ${theme} ${isBlank ? "is-blank" : ""}`}
        data-testid={testId}
      >
        <div
          ref={screenRef}
          className="monitor-screen"
          style={{
            aspectRatio: screenAspect,
            padding: `${pad}%`,
          }}
        >
          <div
            className="monitor-background-layer"
            style={{
              background: isBlank ? "#000" : renderPayload?.backgroundColor,
              backgroundImage: isBlank || !bg ? undefined : `url("${bg}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              transition: `background-color ${Math.max(0, renderPayload?.backgroundFadeMs ?? DEFAULT_SETTINGS.backgroundFadeMs)}ms ease`,
              filter: isBlank ? undefined : `brightness(${brightness})`,
            }}
          />
          {isBackgroundVideo(renderPayload?.backgroundImagePath) && <video className="monitor-background-video" style={{ filter: `brightness(${brightness})` }} src={bg} muted loop autoPlay playsInline preload="auto" onCanPlay={(event) => { void event.currentTarget.play().catch(() => undefined); }} />}
          {isLive ? (
            <div
              className={`monitor-screen-fade ${visible ? "show" : ""}`}
              style={{ transitionDuration: `${fadeMs}ms` }}
            >
              {screenContent}
            </div>
          ) : screenContent}
        </div>
      </div>
      </CardContent>
    </Card>
  );
}
