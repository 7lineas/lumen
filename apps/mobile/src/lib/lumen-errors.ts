import { LumenApiError } from "./lumen-client";

const MESSAGES: Record<string, string> = {
  invalid_pairing_code:
    "El código no coincide. Revise los seis dígitos en Lumen.",
  too_many_attempts:
    "Demasiados intentos fallidos. Espere 15 minutos o cambie el código en Lumen.",
  too_many_sessions: "Hay demasiados dispositivos conectados a Lumen.",
  unauthorized: "La sesión venció. Conéctese de nuevo.",
  unsupported_operation: "Esta versión de Lumen no admite esa operación.",
};

/** Spanish message for the user. Anything that is not a Lumen answer is a network problem. */
export function describeLumenError(error: unknown): string {
  if (error instanceof LumenApiError) {
    return (
      MESSAGES[error.code] ?? `Lumen respondió con un error (${error.code}).`
    );
  }
  return "No hay respuesta de Lumen. Revise que Lumen esté abierto y que el teléfono esté en la misma red Wi-Fi, o con Tailscale encendido en ambos equipos.";
}
