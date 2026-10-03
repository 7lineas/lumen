# Descargas Windows — Lumen

La página pública está en `landing/`. Los archivos, tamaños y SHA-256 viven en `landing/releases.json`.

Cada enlace es `https://downloads.7lineas.com/` más el nombre del archivo. Esa base está en `landing/config.json` (`DOWNLOAD_BASE_URL`) y en `landing/releases.json` (`downloadBaseUrl`).

| Archivo | URL |
| --- | --- |
| Instalador | https://downloads.7lineas.com/proyectorbiblico-1.0.0-setup.exe |
| Portable | https://downloads.7lineas.com/proyectorbiblico-1.0.0-portable.exe |

Esas URL empiezan a servir el archivo cuando se publica el build en el bucket R2 `desktop-releases`. Hasta entonces el bucket está vacío.

Los módulos de Biblias van en el mismo bucket, bajo `bibles/`. La lista y el modo de subirlos están en el README, sección «Biblias descargables».

Para generar el instalador: `pnpm pack:win` → `release/`.
Para publicarlo: `pnpm publish:release -- --dir release`. Las variables de entorno están en el README, sección «Publicar el instalador en R2».
