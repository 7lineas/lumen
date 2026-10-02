import { OperatorApp } from "./operator/OperatorApp";
import { ProjectorView } from "./projector/ProjectorView";

export function App() {
  const isProjector = window.location.hash === "#/projector" || window.location.hash === "#projector";

  if (isProjector) {
    return <ProjectorView />;
  }
  return <OperatorApp />;
}
