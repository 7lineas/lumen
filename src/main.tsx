import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { App, isProjectorRoute, preloadOperatorApp } from "./App";
import { BrowserAccessGate } from "./BrowserAccessGate";
import { installBrowserApi, refreshBrowserSession } from "./browser-api";
import { InstalledFontFaces } from "./components/InstalledFontFaces";
import "@fontsource-variable/geist";
import "./styles.css";

// Platform classes for the top bar (traffic-light space on macOS, window
// controls on Windows); the top bar is the window title area in Electron.
if (navigator.userAgent.includes("Electron"))
  document.body.classList.add("electron");
document.body.classList.add(/Mac/.test(navigator.userAgent) ? "mac" : "win");

// The operator UI chunk downloads alongside this one; rendering once it is in
// avoids a suspended first render (see preloadOperatorApp).
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
