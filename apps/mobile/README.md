# Lumen móvil

Aplicación nativa (Expo, React Native) para operar Lumen desde un teléfono o tableta de la misma red. No reemplaza la app de escritorio: el equipo con Lumen sigue siendo el dueño de las Biblias, los ajustes y la ventana del proyector.

Qué hace hoy:

- Conectarse escaneando el código QR de Lumen, o escribiendo la dirección y el código de seis dígitos.
- Conectarse desde la misma red Wi-Fi o desde otra red con Tailscale. Si el teléfono cambia de red, la app prueba las direcciones guardadas y usa la que responda.
- Ver en vivo lo que se proyecta.
- Buscar un pasaje (`Juan 3:16`), revisarlo en vista previa y **Proyectar**.
- Anterior / Siguiente versículo, cambiar de versión y pantalla negra.

Pendiente: cola del culto, canciones, textos y diapositivas.

## Conectar

1. En el equipo con Lumen: **Ajustes → Acceso desde otros dispositivos**.
2. En el teléfono: pulse **Escanear código QR** y apunte a la pantalla de Lumen. También puede escribir la dirección (por ejemplo `192.168.1.20`) y el código de seis dígitos.
3. Lumen debe seguir abierto. Si Lumen se reinicia, hay que volver a conectar.

Hay dos caminos según la red:

- **Misma red Wi-Fi o cable:** use el QR o la dirección de red local de Lumen.
- **Otra red (datos móviles, otro Wi-Fi):** instale Tailscale en el equipo con Lumen y en el teléfono, con la misma cuenta. Use el QR de la sección **Desde fuera de la iglesia** de Ajustes.

El tráfico es HTTP. En la red local viaja sin cifrar; con Tailscale va cifrado por la propia red privada. No exponga el puerto `43124` a internet.

## Desarrollo

Desde la raíz del repositorio:

```bash
pnpm install
pnpm mobile              # Expo dev client (requiere build de desarrollo)
pnpm mobile:android      # abre en Android
pnpm mobile:typecheck
pnpm mobile:test
pnpm --filter lumen-mobile lint
pnpm --filter lumen-mobile export   # bundle de prueba para Android
```

Para instalar el build de desarrollo en un teléfono: `pnpm mobile:build:dev:android` (EAS).

## Estructura

- `app/`: rutas de expo-router. Solo eligen la pantalla; no contienen lógica.
- `src/features/<nombre>/`: pantallas y lógica de cada área. Se importan a través de `index.ts`.
- `src/lib/`: cliente de `/api/v1` (`lumen-client.ts`), eventos en vivo (`lumen-events.ts`), sesión en SecureStore (`session-storage.ts`).
- `src/components/design/`: piezas visuales (`Screen`, `Card`, `Button`, `Field`).
- `../../shared/`: lógica de versículos compartida con el escritorio (referencias, Biblias, tipos del proyector). Se importa como `@shared/...`; no se copia.

Reglas:

- El token de sesión vive solo en SecureStore, nunca en AsyncStorage.
- El protocolo `/api/v1` está descrito en `docs/BROWSER-ACCESS.md`. Cualquier canal nuevo debe estar en la lista de canales permitidos del escritorio (`electron/browser-service.ts`).
- Los textos de la interfaz van en español.

## Antes de publicar

- `eas init` para crear el proyecto EAS y añadir su `projectId` en `app.json`.
- Revisar `ios.bundleIdentifier` y `android.package` con la cuenta de la organización. `com.7lineas.lumen` no es válido para Android (un segmento no puede empezar con dígito) y `expo prebuild` falla con él; hay que elegir otro identificador antes de compilar para Android.
- Probar el emparejamiento y el flujo de proyección en un teléfono real, con la app de escritorio abierta.
- **Bloqueante de publicación: tráfico HTTP sin cifrar en la red local.** La app habla HTTP plano con Lumen en la LAN; para eso están `usesCleartextTraffic` (Android) y `NSAllowsLocalNetworking` (iOS) en `app.json`. `docs/BROWSER-ACCESS.md` (alrededor de la línea 38) indica que antes de publicar una app móvil nativa, o de exponer Lumen más allá de una LAN de confianza, deben existir TLS, roles por usuario, esquemas de petición auditados y un SDK de cliente estable. Hasta entonces, resolver este punto o aceptarlo explícitamente antes de cualquier release en tienda o EAS.
- La dirección que escribe el voluntario se normaliza con `normalizeHostAddress`, que acepta cualquier nombre de host. El código de emparejamiento y el token de sesión se envían, por tanto, a cualquier host que se escriba, así que confirme que la dirección corresponde al equipo de Lumen.
