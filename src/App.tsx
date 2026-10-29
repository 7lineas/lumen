import { lazy, Suspense, useEffect } from "react";
import { ProjectorView } from "./projector/ProjectorView";

// Separate chunk so the projector window doesn't parse the operator UI.
const OperatorApp = lazy(() =>
  import("./operator/OperatorApp").then((m) => ({ default: m.OperatorApp })),
);

export function App() {
  const isProjector =
    window.location.hash === "#/projector" ||
    window.location.hash === "#projector";
  const hostname = window.location.hostname;
  const isRemoteBrowser =
    window.__LUMEN_BROWSER__ &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    hostname !== "[::1]";

  useEffect(() => {
    if (isRemoteBrowser && isProjector) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }, [isProjector, isRemoteBrowser]);

  // The LAN client exposes the controller only. The actual projector remains
  // on the host computer in its dedicated Electron window.
  if (isProjector && !isRemoteBrowser) {
    return <ProjectorView />;
  }
  return (
    <Suspense fallback={null}>
      <OperatorApp />
    </Suspense>
  );
}
