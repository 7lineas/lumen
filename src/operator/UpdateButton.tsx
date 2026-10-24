import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
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

function useAppUpdateState() {
  const [state, setState] = useState<AppUpdateState | null>(null);

  useEffect(() => {
    const api = window.proyector;
    if (!api) return;
    void api.getAppUpdateState().then(setState).catch(() => undefined);
    return api.onAppUpdateState(setState);
  }, []);

  return [state, setState] as const;
}

/**
 * Icono de recarga para buscar una versión nueva a mano. Va en la barra
 * superior y solo se oculta mientras el botón de actualización está visible.
 */
export function UpdateCheckButton() {
  const [state, setState] = useAppUpdateState();

  // En desarrollo no hay nada que comprobar.
  if (!state || state.mode === "disabled" || shouldShowUpdateButton(state)) return null;

  const checking = state.status === "checking";

  async function onCheck() {
    const api = window.proyector;
    // Una comprobación ya en curso (el icono gira) no se repite.
    if (!api || checking) return;
    try {
      setState(await api.checkAppUpdate());
    } catch {
      // Sin respuesta del proceso principal: el icono simplemente deja de girar.
    }
  }

  return (
    <Button
      type="button"
      data-testid="btn-check-update"
      className="update-check"
      variant="ghost"
      size="icon"
      title="Buscar actualizaciones"
      aria-label="Buscar actualizaciones"
      onClick={() => void onCheck()}
    >
      <RefreshCw className={checking ? "animate-spin" : undefined} />
    </Button>
  );
}

/**
 * Botón de actualización: solo existe cuando hay una versión nueva (o una
 * descarga en curso).
 */
export function UpdateButton() {
  const [state, setState] = useAppUpdateState();
  const [dialogState, setDialogState] = useState<AppUpdateState | null>(null);
  const [busy, setBusy] = useState(false);

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
