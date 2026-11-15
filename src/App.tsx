import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { ProjectorView } from "./projector/ProjectorView";

let operatorModule: Promise<ComponentType> | null = null;
let LoadedOperatorApp: ComponentType | null = null;

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
