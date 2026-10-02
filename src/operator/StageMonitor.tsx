import type { ProjectorPayload } from "@shared/types";

interface Props {
  title: string;
  payload: ProjectorPayload | null;
  empty: string;
  testId?: string;
}

export function StageMonitor({ title, payload, empty, testId }: Props) {
  const theme = payload?.theme === "light" ? "light" : "dark";
  const brightness = payload?.brightness ?? 1;
  const isBlank = !payload || payload.mode === "blank";
  const isLogo = payload?.mode === "logo";

  return (
    <figure className="monitor-card">
      <figcaption>{title}</figcaption>
      <div
        className={`monitor ${theme} ${isBlank ? "is-blank" : ""}`}
        data-testid={testId}
        style={{
          background: isBlank ? "#000" : payload?.backgroundColor,
          filter: isBlank ? undefined : `brightness(${brightness})`,
        }}
      >
        {isBlank && <p className="monitor-empty">{empty}</p>}
        {isLogo && <p className="monitor-logo">{payload?.churchName}</p>}
        {payload?.mode === "verse" && (
          <div className="monitor-verse">
            <p className="monitor-ref">{payload.referenceLabel}</p>
            {payload.blocks.map((block, i) => (
              <p key={i}>{block.text}</p>
            ))}
            {payload.copyright && <p className="monitor-copyright">{payload.copyright}</p>}
          </div>
        )}
      </div>
    </figure>
  );
}
