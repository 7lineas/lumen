import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

// Minimize / maximize / close for the frameless window (Windows and Linux).
// Drawn in the top bar, so dialogs and the accent line stack beneath them.
// Renders nothing on macOS (native traffic lights) or in the LAN browser.
export function WindowControls() {
  const controls = window.proyector?.windowControls;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!controls) return;
    void controls
      .isMaximized()
      .then(setMaximized)
      .catch(() => undefined);
    return controls.onMaximizedChange(setMaximized);
  }, [controls]);

  if (!controls || document.body.classList.contains("mac")) return null;

  return (
    <div className="window-controls">
      <button
        type="button"
        aria-label="Minimizar"
        title="Minimizar"
        onClick={() => void controls.control("minimize")}
      >
        <Minus />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restaurar" : "Maximizar"}
        title={maximized ? "Restaurar" : "Maximizar"}
        onClick={() => void controls.control("toggle-maximize")}
      >
        {maximized ? <Copy /> : <Square />}
      </button>
      <button
        type="button"
        className="close"
        aria-label="Cerrar"
        title="Cerrar"
        onClick={() => void controls.control("close")}
      >
        <X />
      </button>
    </div>
  );
}
