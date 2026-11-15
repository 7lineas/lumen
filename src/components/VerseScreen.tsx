import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ProjectorPayload } from "@shared/types";
import { fitFontSize } from "@shared/text-fit";

export function splitReference(label: string): {
  ref: string;
  version: string;
} {
  const sep = label.lastIndexOf(" — ");
  if (sep < 0) return { ref: label, version: "" };
  return { ref: label.slice(0, sep), version: label.slice(sep + 3) };
}

interface Props {
  payload: ProjectorPayload;
  fontSize: number;
  fitKey?: string;
  className: string;
  style?: CSSProperties;
  referenceColor: string;
  versionColor: string;
}

export function VerseScreen({
  payload,
  fontSize,
  fitKey,
  className,
  style,
  referenceColor,
  versionColor,
}: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fitSize, setFitSize] = useState(fontSize);

  useLayoutEffect(() => {
    const el = textRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;
    let raf = 0;
    let alive = true;
    const fit = () => {
      const size = fitFontSize(fontSize, (s) => {
        inner.style.fontSize = `${s}px`;
        return (
          el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth
        );
      });
      inner.style.fontSize = `${size}px`;
      setFitSize(size);
    };
    const refit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };
    fit();
    const observer = new ResizeObserver(refit);
    observer.observe(el);
    const fonts = document.fonts;
    fonts?.addEventListener("loadingdone", refit);
    void fonts?.ready.then(() => {
      if (alive) fit();
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      fonts?.removeEventListener("loadingdone", refit);
    };
  }, [payload, fontSize, fitKey]);

  const { ref, version } = splitReference(payload.referenceLabel);
  return (
    <div
      ref={innerRef}
      className={className}
      style={{ ...style, fontSize: `${fitSize}px` }}
    >
      {ref && (
        <header
          className="projector-ref"
          style={{ color: referenceColor, fontSize: "0.75em" }}
        >
          {ref}
        </header>
      )}
      <div
        ref={textRef}
        className={`projector-body ${payload.blocks.length > 1 ? "dual" : ""}`}
        style={{ fontWeight: payload.fontWeight }}
      >
        {payload.blocks.map((block, i) => (
          <section key={i} className="projector-column">
            {block.label && (
              <div className="projector-col-label">{block.label}</div>
            )}
            <p className="projector-text">{block.text}</p>
          </section>
        ))}
      </div>
      {version && (
        <div className="projector-footer">
          <div
            className="projector-version"
            style={{ color: versionColor, fontSize: "0.75em" }}
          >
            {version}®
          </div>
        </div>
      )}
    </div>
  );
}
