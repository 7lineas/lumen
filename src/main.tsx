import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { App, isProjectorRoute, preloadOperatorApp } from "./App";
import { BrowserAccessGate } from "./BrowserAccessGate";
import { installBrowserApi, refreshBrowserSession } from "./browser-api";
import { InstalledFontFaces } from "./components/InstalledFontFaces";
import "@fontsource-variable/geist";
import "./styles.css";

if (navigator.userAgent.includes("Electron"))
  document.body.classList.add("electron");
document.body.classList.add(/Mac/.test(navigator.userAgent) ? "mac" : "win");

const operatorReady = isProjectorRoute()
  ? Promise.resolve()
  : preloadOperatorApp().then(
      () => undefined,
      () => undefined,
    );

function renderApp() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserAccessGate>
        <InstalledFontFaces />
        <App />
      </BrowserAccessGate>
      <Toaster position="top-center" />
    </StrictMode>,
  );
}

if (!window.proyector) {
  installBrowserApi();
  void refreshBrowserSession()
    .catch(() => localStorage.removeItem("lumen-access-token"))
    .finally(() => void operatorReady.then(renderApp));
} else {
  void operatorReady.then(renderApp);
}
