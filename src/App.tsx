import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { ProjectorView } from "./projector/ProjectorView";

// Separate chunk so the projector window doesn't parse the operator UI.
let operatorModule: Promise<ComponentType> | null = null;
let LoadedOperatorApp: ComponentType | null = null;

/**
 * Starts (once) loading the operator UI chunk. main.tsx waits for it before
 * the first render: a lazy component that suspends on mount is revealed by
 * React 19 only after its ~300 ms Suspense throttle, which held back the
 * window's first frame.
 */
export function preloadOperatorApp(): Promise<ComponentType> {
  operatorModule ??= import("./operator/OperatorApp").then((m) => {
    LoadedOperatorApp = m.OperatorApp;
    return m.OperatorApp;
  });
  return operatorModule;
}

const OperatorApp = lazy(() =>
  preloadOperatorApp().then((component) => ({ default: component })),
);

export function isProjectorRoute(): boolean {
  return (
    window.location.hash === "#/projector" ||
    window.location.hash === "#projector"
  );
}

export function App() {
  const isProjector = isProjectorRoute();
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
  if (LoadedOperatorApp) return <LoadedOperatorApp />;
  return (
    <Suspense fallback={null}>
      <OperatorApp />
    </Suspense>
  );
}
