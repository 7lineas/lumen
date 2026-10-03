import { useEffect, useRef, useState } from "react";
import type { AppSettings, ProjectorPayload } from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";

const EMPTY: ProjectorPayload = {
  mode: "blank",
  referenceLabel: "",
  blocks: [],
  churchName: DEFAULT_SETTINGS.churchName,
  fontSize: DEFAULT_SETTINGS.fontSize,
  brightness: 1,
  theme: "dark",
  backgroundColor: "#000000",
  copyright: "",
};

export function ProjectorView() {
  const [payload, setPayload] = useState<ProjectorPayload>(EMPTY);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [visible, setVisible] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const [fitSize, setFitSize] = useState(settings.fontSize);

  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    void api.getSettings().then((s) => setSettings({ ...DEFAULT_SETTINGS, ...s }));
    return api.onProjectorUpdate((p) => {
      setPayload(p);
      if (p.mode === "blank") {
        setVisible(false);
      } else {
        setVisible(false);
        requestAnimationFrame(() => setVisible(true));
      }
    });
  }, []);

  const fontSize = payload.fontSize || settings.fontSize;

  useEffect(() => {
    setFitSize(fontSize);
  }, [fontSize, payload]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || payload.mode !== "verse") return;
    let size = fontSize;
    const fit = () => {
      el.style.fontSize = `${size}px`;
      while (size > 28 && el.scrollHeight > window.innerHeight * 0.72) {
        size -= 2;
        el.style.fontSize = `${size}px`;
      }
      setFitSize(size);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [payload, fontSize]);

  const themeClass = (payload.theme ?? settings.theme) === "light" ? "projector light" : "projector dark";
  const brightness = payload.brightness ?? settings.brightness ?? 1;
  const style: React.CSSProperties = {
    fontSize: `${fitSize}px`,
    backgroundColor: settings.backgroundImagePath ? undefined : payload.backgroundColor || settings.backgroundColor,
    backgroundImage: settings.backgroundImagePath
      ? `url(file://${settings.backgroundImagePath})`
      : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: payload.mode === "blank" ? undefined : `brightness(${brightness})`,
  };

  if (payload.mode === "blank") {
    return <div className={`${themeClass} blank`} style={{ backgroundColor: "#000" }} />;
  }

  if (payload.mode === "logo") {
    return (
      <div className={themeClass} style={style}>
        <div className={`projector-inner fade ${visible ? "show" : ""}`}>
          <p className="projector-logo">{payload.churchName || settings.churchName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={themeClass} style={style}>
      <div className={`projector-inner fade ${visible ? "show" : ""}`}>
        {payload.referenceLabel && <header className="projector-ref">{payload.referenceLabel}</header>}
        <div ref={textRef} className={`projector-body ${payload.blocks.length > 1 ? "dual" : ""}`}>
          {payload.blocks.map((block, i) => (
            <section key={i} className="projector-column">
              {block.label && <div className="projector-col-label">{block.label}</div>}
              <p className="projector-text">{block.text}</p>
            </section>
          ))}
        </div>
        {payload.copyright && <footer className="projector-copyright">{payload.copyright}</footer>}
      </div>
    </div>
  );
}
