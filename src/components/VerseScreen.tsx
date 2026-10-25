import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ProjectorPayload } from "@shared/types";
import { fitFontSize } from "@shared/text-fit";

export function splitReference(label: string): { ref: string; version: string } {
  const sep = label.lastIndexOf(" — ");
  if (sep < 0) return { ref: label, version: "" };
  return { ref: label.slice(0, sep), version: label.slice(sep + 3) };
}

interface Props {
  /** A "verse" payload: Bible verses, song parts and textos. */
  payload: ProjectorPayload;
  /** Largest size (px at projector resolution); the text shrinks from here to fit. */
  fontSize: number;
  /** Anything else that changes text metrics (typeface, weight…): a change refits. */
  fitKey?: string;
  className: string;
  style?: CSSProperties;
  referenceColor: string;
  versionColor: string;
}

/**
 * The text of a verse/song/texto screen, fitted to its box. The projector
 * renders it at full size and the operator monitors render the very same
 * markup at projector resolution, scaled down, so both wrap and size alike.
 */
export function VerseScreen({ payload, fontSize, fitKey, className, style, referenceColor, versionColor }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fitSize, setFitSize] = useState(fontSize);

  // Layout effect: the new text is fitted before it is painted, so it never
  // shows for a frame at the previous text's size.
  useLayoutEffect(() => {
    const el = textRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;
    let raf = 0;
    let alive = true;
    const fit = () => {
      // Always restart from the full size so growing the window grows text back.
      // The body is a flex-1 box with overflow hidden, so fitting to its own
      // box keeps header/footer clear at any window ratio. The header and
      // footer are em-sized from the inner box, so each candidate size is set
      // on the inner box before measuring: they grow and shrink with the text.
      const size = fitFontSize(fontSize, (s) => {
        inner.style.fontSize = `${s}px`;
        return el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth;
      });
      inner.style.fontSize = `${size}px`;
      setFitSize(size);
    };
    const refit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };
    fit();
    // The body's box also changes with padding, the header/footer, or the window:
    // observe it instead of only listening for window resizes.
    const observer = new ResizeObserver(refit);
    observer.observe(el);
    // Webfonts arriving late change metrics: refit when they finish loading.
    // `ready` also covers a face that started loading during the first fit.
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
    <div ref={innerRef} className={className} style={{ ...style, fontSize: `${fitSize}px` }}>
      {/* Floating labels (reference top-left, version® bottom-right) share one
          size: 3/4 of the fitted verse text, so they scale with the inner box. */}
      {ref && <header className="projector-ref" style={{ color: referenceColor, fontSize: "0.75em" }}>{ref}</header>}
      <div
        ref={textRef}
        className={`projector-body ${payload.blocks.length > 1 ? "dual" : ""}`}
        // A song's or texto's own weight wins over the body's default.
        style={{ fontWeight: payload.fontWeight }}
      >
        {payload.blocks.map((block, i) => (
          <section key={i} className="projector-column">
            {block.label && <div className="projector-col-label">{block.label}</div>}
            <p className="projector-text">{block.text}</p>
          </section>
        ))}
      </div>
      {version && (
        <div className="projector-footer">
          <div className="projector-version" style={{ color: versionColor, fontSize: "0.75em" }}>{version}®</div>
        </div>
      )}
    </div>
  );
}
