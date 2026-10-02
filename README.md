# Proyector Bíblico

Aplicación de escritorio **offline** para proyectar versículos de la Biblia en el culto (pantalla del videobeam / segundo monitor). Pensada para voluntarios de una iglesia en Colombia.

## Requisitos

- Windows 10 u 11 (64 bits)
- Segundo monitor o proyector (opcional; con un solo monitor la ventana de proyección se abre en modo ventana para pruebas)

## Instalación (voluntarios)

1. Descargue el instalador `Proyector Bíblico-1.0.0-win-x64.exe` o el ejecutable portable `Proyector Bíblico-1.0.0-portable.exe` desde la carpeta de entrega de su iglesia.
2. Ejecute el archivo. Windows puede mostrar **“Windows protegió su PC”** porque la aplicación no está firmada digitalmente.
3. Haga clic en **“Más información”** y luego en **“Ejecutar de todas formas”**.
4. En el instalador NSIS, elija la carpeta de instalación y finalice.
5. Abra **Proyector Bíblico** desde el menú Inicio.

### Conectar el videobeam

1. Conecte el proyector o pantalla LED por **HDMI** (o el cable que use su equipo).
2. En Windows, pulse **Win + P** y elija **“Duplicar”** o **“Extender”** (recomendado: **Extender** para que el operador vea el panel de control en el portátil y el público solo el versículo).
3. En la app, pestaña **Ajustes**, seleccione la **pantalla del proyector** si hay más de una. Por defecto se usa la segunda pantalla.
4. La ventana de proyección se abre sola al iniciar; use **Proyectar** para enviar el versículo.

## Uso rápido

1. Elija libro, capítulo y versículo en la columna izquierda, o escriba `Juan 3:16`.
2. Revise **Vista previa**. El videobeam no cambia hasta que pulse **Proyectar**.
3. **En vivo** muestra lo que ve la congregación, incluida la pantalla negra o el logo.
4. Arme la lista **Servicio** antes del culto y avance con **Siguiente**.

### Pestañas

- **Buscar**: referencia, selector libro/capítulo/versículo, búsqueda por palabra, historial.
- **Cola**: lista para el servicio; **Proyectar** en cada ítem.
- **Ajustes**: pantalla, dos versiones lado a lado, tema, fuente, fondo.
- **Acerca de**: versiones de la Biblia incluidas y licencias.

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| Clic en un versículo | Lo deja en **vista previa**, sin cambiar el videobeam |
| Mayús + clic | Marca un rango en el mismo capítulo |
| Doble clic | Lo proyecta de inmediato |
| Enter | Envía la vista previa al videobeam |
| ← / → (o ↑ / ↓) | Versículo anterior / siguiente, solo en la vista previa |
| Esc o B | Pantalla negra / volver al último versículo |
| Logo | Muestra el nombre de la iglesia (Ajustes) |
| Siguiente | Avanza al próximo ítem de la lista del servicio |

La columna **En vivo** repite lo que hay en el proyector. Fuente y luz están en la barra superior.

## Versiones de la Biblia incluidas

- Reina-Valera 1909 (español, principal)
- King James Version (inglés)
- World English Bible (inglés)

Detalle legal: `LICENSES/BIBLES.md`.

**No** se incluyen RVR1960, NVI, NTV ni otras traducciones con derechos de autor.

---

## Desarrollo

### Requisitos

- Node.js 20+
- pnpm 9+

### Comandos

```bash
pnpm install
pnpm convert:bibles    # descarga VPL desde eBible.org y genera data/bibles/*.json
pnpm dev               # modo desarrollo (Electron + Vite en http://localhost:43123)
pnpm test              # pruebas (referencias y búsqueda)
pnpm lint
pnpm build             # compila interfaz y proceso principal
pnpm pack:win          # instalador NSIS + portable (en Linux hace falta Wine para NSIS)
pnpm landing           # página de descarga en http://127.0.0.1:44731
pnpm landing:check     # comprueba que los enlaces se arman
pnpm publish:release   # hashes + subida a R2 (ver variables abajo)
```

### Artefactos Windows

Tras `pnpm pack:win`, en `release/`:

- `Proyector Bíblico-1.0.0-win-x64.exe` — instalador
- `Proyector Bíblico-1.0.0-portable.exe` — portable
- `win-unpacked/` — carpeta descomprimida (útil si el instalador falla)

### Capturas de pantalla (CI / VM)

```bash
xvfb-run -a pnpm screenshots
```

Genera `operator-window.png`, `settings-window.png`, `biblias-window.png` y `projector-window.png` en `/opt/cursor/artifacts`.

## Página de descarga

Sitio estático en `landing/`, listo para Vercel. El proyecto de Vercel debe usar la **raíz del repositorio**: `vercel.json` ejecuta `scripts/prepare-landing.mjs` y publica `landing-dist/`. No cambie el Root Directory a `landing/`, porque los créditos salen de `shared/bible-licenses.json`.

Los enlaces de los `.exe` se arman con una sola base, `DOWNLOAD_BASE_URL`, en `landing/config.json`. El mismo valor está en `landing/releases.json` como `downloadBaseUrl`. El valor por defecto es `https://downloads.7lineas.com` (dominio público del bucket R2 `desktop-releases`). La página no llama al bucket: lee su propio `releases.json` y el botón es un enlace directo. Por eso el bucket no necesita CORS.

El bucket está vacío hasta la primera publicación. Hasta entonces esas URL responden que el archivo no existe.

### Publicar el instalador en R2

Las credenciales no se guardan en el repositorio. David las pasa por el entorno en el momento de publicar.

| Variable | Obligatoria | Valor |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | Sí | ID de la cuenta de Cloudflare |
| `R2_ACCESS_KEY_ID` | Sí | Access key del token limitado al bucket |
| `R2_SECRET_ACCESS_KEY` | Sí | Secret del mismo token |
| `R2_BUCKET` | No | `desktop-releases` |
| `R2_ENDPOINT` | No | `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_REGION` | No | `auto` |
| `DOWNLOAD_BASE_URL` | No | `https://downloads.7lineas.com` |

La subida usa la API S3 de R2 (`R2_ENDPOINT`), no el dominio público. El dominio público solo sirve para descargar.

```bash
pnpm pack:win
pnpm publish:release -- --dir release
```

`--dry-run` calcula hashes y no sube nada. El script escribe de nuevo `landing/releases.json` (versión, tamaños, SHA-256 y `downloadBaseUrl`) y sube los `.exe` más una copia de ese JSON. Después de cambiar hashes o la versión, hay que volver a desplegar la landing para que la página muestre los datos nuevos. Los créditos de cada Biblia se editan en `shared/bible-licenses.json`.

## Biblias descargables

Dentro de la app, la pantalla Biblias baja versiones libres a la carpeta de datos del usuario (`userData/bibles`). RV1909, KJV y WEB siguen dentro del instalador. El catálogo remoto es `https://downloads.7lineas.com/bibles/bibles-catalog.json`. Si no hay internet, se usa la copia que va con el programa y las versiones ya descargadas.

Cada módulo es un JSON con metadatos (nombre, copyright, licencia), libros y versículos: el mismo formato que `data/bibles`. No se usa SQLite. La app ya lee ese JSON sin conexión, y un addon nativo complicaría el instalador de Windows.

`pnpm build:bible-modules` descarga el VPL de eBible, escribe los módulos y calcula el SHA-256. Los `{id}.json` grandes no van al repositorio. El catálogo sí: `data/bible-modules/bibles-catalog.json`. Hay que subir el catálogo y los módulos juntos. Si se vuelve a generar y eBible cambió, los hashes cambian y hay que publicar ambos de nuevo.

La aplicación no tiene la lista de versiones escrita en el código. Una versión nueva es un archivo `{id}.json` más una entrada en `bibles-catalog.json`. Para que el script la genere, basta añadir la ficha en `shared/bible-licenses.json` (con `vplZip`). Reina Valera Gómez, RVR1960, NVI, NTV, DHH, TLA, RVC, LBLA y el resto con copyright no están: David aún no tiene permiso. Cuando lo tenga, se agregan igual, sin cambiar código.

### Qué subir a `desktop-releases/bibles/`

Después de `pnpm build:bible-modules`, suba estos archivos del directorio `data/bible-modules/` al bucket `desktop-releases`, con la clave `bibles/` más el nombre. No los suba desde este repositorio si no tiene el token de R2. Use las mismas variables que para el instalador (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).

| Archivo local | Clave en el bucket | URL pública |
| --- | --- | --- |
| `bibles-catalog.json` | `bibles/bibles-catalog.json` | https://downloads.7lineas.com/bibles/bibles-catalog.json |
| `bes.json` | `bibles/bes.json` | https://downloads.7lineas.com/bibles/bes.json |
| `onbv.json` | `bibles/onbv.json` | https://downloads.7lineas.com/bibles/onbv.json |
| `pddpt.json` | `bibles/pddpt.json` | https://downloads.7lineas.com/bibles/pddpt.json |
| `bll.json` | `bibles/bll.json` | https://downloads.7lineas.com/bibles/bll.json |
| `blm.json` | `bibles/blm.json` | https://downloads.7lineas.com/bibles/blm.json |
| `asv.json` | `bibles/asv.json` | https://downloads.7lineas.com/bibles/asv.json |

Ejemplo, sin guardar secretos en el repo:

```bash
pnpm build:bible-modules
aws s3 cp data/bible-modules/bibles-catalog.json s3://desktop-releases/bibles/bibles-catalog.json \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --content-type application/json
aws s3 cp data/bible-modules/bes.json s3://desktop-releases/bibles/bes.json \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --content-type application/json
```

Repita el `aws s3 cp` para `onbv.json`, `pddpt.json`, `bll.json`, `blm.json` y `asv.json`. El proceso de Electron descarga directo; no hace falta CORS en el bucket. La landing sigue leyendo solo sus propios JSON.

## Licencia del código

MIT. Los textos bíblicos siguen su propia licencia (dominio público); ver `LICENSES/BIBLES.md`.
