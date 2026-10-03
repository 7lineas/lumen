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
}

function contentKey(p: ProjectorPayload | null): string {
  if (!p || p.mode === "blank") return "blank";
  if (p.mode === "logo") return `logo:${p.churchName}`;
  return `verse:${p.referenceLabel}|${p.blocks.map((b) => `${b.label ?? ""}=${b.text}`).join("|")}`;
}

export function StageMonitor({ title, payload, empty, testId, isLive }: Props) {
  // Live monitor mirrors the projector: fade out old content, swap, fade in.
  // Preview renders instantly (no fade).
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
  const fontScale = (renderPayload?.fontSize ?? 72) / 72;
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

  const content = (
    <>
      {isBlank && <p className="monitor-empty">{empty}</p>}
      {isLogo && <p className="monitor-logo" style={{ fontSize: `${fontScale}em` }}>{renderPayload?.churchName}</p>}
      {renderPayload?.mode === "verse" && (
        <div className="monitor-verse" style={{ fontSize: `${fontScale}em` }}>
          {ref && <p className="monitor-ref" style={{ color: referenceColor }}>{ref}</p>}
          {renderPayload.blocks.map((block, i) => (
            <p key={i}>{block.text}</p>
          ))}
          {version && <p className="monitor-version" style={{ color: versionColor }}>{version}</p>}
          {renderPayload.copyright && <p className="monitor-copyright">{renderPayload.copyright}</p>}
        </div>
      )}
    </>
  );

  return (
    <Card className="monitor-card">
      <CardHeader><CardTitle>{isLive && <span className={`live-dot ${projecting ? "on" : ""}`} aria-hidden />}{title}</CardTitle></CardHeader>
      <CardContent className="monitor-content">
      <div
        className={`monitor ${theme} ${isBlank ? "is-blank" : ""}`}
        data-testid={testId}
        style={{
          padding: `${(renderPayload?.padding ?? DEFAULT_SETTINGS.padding) / 5}rem`,
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
        {isBackgroundVideo(renderPayload?.backgroundImagePath) && <video className="monitor-background-video" style={{ filter: `brightness(${brightness})` }} src={bg} muted loop autoPlay playsInline />}
        {isLive ? (
          <div
            className={`monitor-fade ${visible ? "show" : ""}`}
            style={{ transitionDuration: `${fadeMs}ms` }}
          >
            {content}
          </div>
        ) : content}
      </div>
      </CardContent>
    </Card>
  );
}
