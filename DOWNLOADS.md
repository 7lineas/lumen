# Descargas Windows — Lumen

La página pública está en `landing/`. Los archivos, tamaños y SHA-256 viven en `landing/releases.json`.

Cada enlace es `https://downloads.7lineas.com/` más el nombre del archivo. Esa base está en `landing/config.json` (`DOWNLOAD_BASE_URL`) y en `landing/releases.json` (`downloadBaseUrl`).

| Archivo | URL |
| --- | --- |
| Instalador | https://downloads.7lineas.com/lumen-1.0.2-setup.exe |
| Portable | https://downloads.7lineas.com/lumen-1.0.2-portable.exe |

Esas URL empiezan a servir el archivo cuando se publica el build en el bucket R2 `desktop-releases`. Hasta entonces el bucket está vacío.

La actualización automática dentro de la app lee `https://downloads.7lineas.com/latest.yml` (proveedor genérico de electron-updater). El script de publicación también sube `latest.yml`, su `.blockmap` y el `.exe` con el nombre que genera electron-builder (`Lumen-<versión>-win-x64.exe`), además de los dos archivos con nombre para la landing.

### Cómo se actualiza la app

No hay botón "Actualizar" permanente. Lumen comprueba `latest.yml` 30 s después de abrir y luego cada 6 horas (cada 30 min si falló); sin red no hace nada y no muestra errores. Solo cuando hay una versión mayor aparece en la barra superior el botón **Actualizar vX.Y.Z**:

1. Al pulsarlo, un diálogo avisa de que Lumen se cerrará y reiniciará (y, si hay una proyección abierta, de que la congregación dejará de ver el contenido).
2. Al confirmar se descarga con progreso en el botón. Si no hay proyección, instala y reinicia solo; si se empezó a proyectar durante la descarga, el botón pasa a **Reiniciar para actualizar** y pide otra confirmación.
3. Un fallo de descarga o instalación deja el botón en «Reintentar» con el motivo.

La versión portable no puede reemplazarse sola: el botón aparece igual y abre la descarga del nuevo portable. Para probar sin publicar nada, ver `LUMEN_UPDATE_DEV_FEED` en `electron/updater.ts` (solo funciona sin empaquetar).

Los módulos de Biblias van en el mismo bucket, bajo `bibles/`. La lista y el modo de subirlos están en el README, sección «Biblias descargables».

Para generar el instalador: `pnpm pack:win` → `release/`.
Para publicarlo: `pnpm publish:release -- --dir release`. Las variables de entorno están en el README, sección «Publicar el instalador en R2».
