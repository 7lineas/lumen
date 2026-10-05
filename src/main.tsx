import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BrowserAccessGate } from "./BrowserAccessGate";
import { installBrowserApi, refreshBrowserSession } from "./browser-api";
import "./styles.css";

function renderApp() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserAccessGate><App /></BrowserAccessGate>
    </StrictMode>,
  );
}

if (!window.proyector) {
  installBrowserApi();
  void refreshBrowserSession().catch(() => sessionStorage.removeItem("lumen-access-token")).finally(renderApp);
} else {
  renderApp();
}
