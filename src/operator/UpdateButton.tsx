import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  getUpdateConfirmation,
  resolveUpdateButtonAction,
  shouldShowUpdateButton,
  updateButtonLabel,
  updateButtonTitle,
  type AppUpdateState,
} from "@shared/app-update";

/**
 * Botón de actualización: solo existe cuando hay una versión nueva (o una
 * descarga en curso). Sin versión nueva no se muestra nada.
 */
export function UpdateButton() {
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [dialogState, setDialogState] = useState<AppUpdateState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    void api.getAppUpdateState().then(setState).catch(() => undefined);
    return api.onAppUpdateState(setState);
  }, []);

  if (!state || !shouldShowUpdateButton(state)) return null;

  const action = resolveUpdateButtonAction(state);
  const downloading = state.status === "downloading";
  const percent = Math.floor(state.downloadPercent ?? 0);

  async function onPress() {
    const api = window.proyector;
    if (!api || busy) return;
    setBusy(true);
    try {
      // Estado fresco: si se está proyectando o no cambia el aviso del diálogo.
      const fresh = await api.getAppUpdateState();
      setState(fresh);
      if (resolveUpdateButtonAction(fresh) === "open") {
        setState(await api.startAppUpdate());
        return;
      }
      setDialogState(fresh);
    } catch {
      // Sin respuesta del proceso principal: no hay nada que hacer aquí.
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    const api = window.proyector;
    const current = dialogState;
    setDialogState(null);
    if (!api || !current) return;
    try {
      if (resolveUpdateButtonAction(current) === "install") setState(await api.installAppUpdate());
      else setState(await api.startAppUpdate());
    } catch {
      // El proceso principal informa los fallos mediante el estado.
    }
  }

  const confirmation = dialogState ? getUpdateConfirmation(dialogState) : null;

  return (
    <>
      <span className="top-sep" aria-hidden />
      <Button
        type="button"
        data-testid="btn-update"
        className="update-button"
        data-state={downloading ? "downloading" : action}
        disabled={downloading || busy}
        title={updateButtonTitle(state)}
        style={downloading ? ({ "--update-progress": `${percent}%` } as React.CSSProperties) : undefined}
        onClick={() => void onPress()}
      >
        {updateButtonLabel(state)}
      </Button>
      {state.message && state.errorContext && state.errorContext !== "check" && !downloading && (
        <span className="update-note" role="status" data-testid="update-error">
          {state.message}
        </span>
      )}
      <AlertDialog open={dialogState !== null} onOpenChange={(open) => !open && setDialogState(null)}>
        <AlertDialogContent data-testid="update-dialog" className="update-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmation?.projectionWarning && (
            <p className="update-warning" role="alert" data-testid="update-projection-warning">
              {confirmation.projectionWarning}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="update-cancel">Ahora no</AlertDialogCancel>
            <AlertDialogAction
              data-testid="update-confirm"
              variant={confirmation?.projectionWarning ? "destructive" : "default"}
              onClick={() => void confirm()}
            >
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
