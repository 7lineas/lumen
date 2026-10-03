import type { ProjectorPayload } from "@shared/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: string;
  payload: ProjectorPayload | null;
  empty: string;
  testId?: string;
  isLive?: boolean;
}

export function StageMonitor({ title, payload, empty, testId, isLive }: Props) {
  const theme = payload?.theme === "light" ? "light" : "dark";
  const brightness = payload?.brightness ?? 1;
  const fontScale = (payload?.fontSize ?? 72) / 72;
  const isBlank = !payload || payload.mode === "blank";
  const isLogo = payload?.mode === "logo";
  const projecting = payload?.mode === "verse" || payload?.mode === "logo";

  return (
    <Card className="monitor-card">
      <CardHeader><CardTitle>{isLive && <span className={`live-dot ${projecting ? "on" : ""}`} aria-hidden />}{title}</CardTitle></CardHeader>
      <CardContent className="monitor-content">
      <div
        className={`monitor ${theme} ${isBlank ? "is-blank" : ""}`}
        data-testid={testId}
        style={{
          background: isBlank ? "#000" : payload?.backgroundColor,
          filter: isBlank ? undefined : `brightness(${brightness})`,
        }}
      >
        {isBlank && <p className="monitor-empty">{empty}</p>}
        {isLogo && <p className="monitor-logo" style={{ fontSize: `${fontScale}em` }}>{payload?.churchName}</p>}
        {payload?.mode === "verse" && (
          <div className="monitor-verse" style={{ fontSize: `${fontScale}em` }}>
            <p className="monitor-ref">{payload.referenceLabel}</p>
            {payload.blocks.map((block, i) => (
              <p key={i}>{block.text}</p>
            ))}
            {payload.copyright && <p className="monitor-copyright">{payload.copyright}</p>}
          </div>
        )}
      </div>
      </CardContent>
    </Card>
  );
}
