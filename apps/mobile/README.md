# Lumen móvil

Aplicación nativa (Expo, React Native) para operar Lumen desde un teléfono o tableta de la misma red. No reemplaza la app de escritorio: el equipo con Lumen sigue siendo el dueño de las Biblias, los ajustes y la ventana del proyector.

Qué hace hoy:

- Conectarse con el equipo anfitrión (dirección + código de seis dígitos).
- Ver en vivo lo que se proyecta.
- Buscar un pasaje (`Juan 3:16`), revisarlo en vista previa y **Proyectar**.
- Anterior / Siguiente versículo, cambiar de versión y pantalla negra.

Pendiente: cola del culto, canciones, textos, diapositivas y escaneo de código QR.

## Conectar

1. En el equipo con Lumen: **Ajustes → Acceso desde otros dispositivos**.
2. En el teléfono: escriba la dirección que muestra Lumen (por ejemplo `192.168.1.20`) y el código de seis dígitos.
3. Ambos equipos deben estar en la misma red y Lumen debe seguir abierto. Si Lumen se reinicia, hay que volver a conectar.

El tráfico es HTTP en la red local (puerto `43124` por defecto). No exponga ese puerto a internet.

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
- Revisar `ios.bundleIdentifier` y `android.package` (`com.7lineas.lumen`) con la cuenta de la organización.
- Probar el emparejamiento y el flujo de proyección en un teléfono real, con la app de escritorio abierta.
