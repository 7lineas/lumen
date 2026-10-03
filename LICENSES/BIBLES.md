# Licencias de textos bíblicos — Lumen

Este documento registra cada traducción, su fuente y su licencia.
Solo se incluyen textos en dominio público o con una licencia libre ya comprobada.

La ficha que leen la ventana Acerca de y la página de descarga es `shared/bible-licenses.json`.
Al añadir una versión, actualice ese archivo; no hace falta tocar el HTML de la landing.

RV1909 va dentro del instalador. Las demás versiones en español se descargan desde
`https://downloads.7lineas.com/bibles/` y quedan en los datos del usuario.

El módulo de cada versión es JSON (metadatos, libros y versículos), no SQLite.
`scripts/build-bible-modules.mjs` lo genera desde el VPL de eBible y escribe
`data/bible-modules/bibles-catalog.json` con el tamaño y el SHA-256.

Una versión nueva no exige cambiar código: archivo `{id}.json` más una entrada
en el catálogo. Para generarla con el script, añada la ficha en
`shared/bible-licenses.json`. Reina Valera Gómez, RVR1960, NVI, NTV, DHH, TLA,
RVC, LBLA y otras con copyright no se incluyen hasta que David tenga permiso.

## Reina-Valera 1909 (id: `rv1909`, abrev: RV1909)

| Campo | Valor |
| --- | --- |
| Idioma | Español |
| Fuente | [eBible.org](https://ebible.org/Scriptures/spaRV1909_vpl.zip) — archivo VPL (`spaRV1909_vpl.txt`) |
| Licencia | **Dominio público** (traducción de 1909) |
| Notas | Canon protestante de 66 libros. Verificado en importación (conteo de libros y versículos). |

## Descargables (no van en el instalador)

| Id | Nombre | Licencia | Notas |
| --- | --- | --- | --- |
| `bes` | Biblia en Español Sencillo | CC BY 4.0 | AudioBiblia.org e Irma Flores, 2018–2019. |
| `onbv` | Biblica® Open Nueva Biblia Viva™ 2008 | CC BY-SA 4.0 | © 2006, 2008 Biblica, Inc. Conservar título y copyright. El texto no se modifica. Génesis 1 no tiene 31 versículos. |
| `pddpt` | Palabra de Dios para ti | CC BY 4.0 | © 2020 Asociación Bíblica Latinoamericana. |
| `bll` | Santa Biblia libre Latinoamericano | Dominio público | Borrador. Solo el canon protestante de 66 libros. |
| `blm` | Santa Biblia libre para el mundo | Dominio público | Borrador de David Williams y Michael Paul Johnson. Solo 66 libros. |

## Traducciones NO incluidas (derechos de autor)

No se distribuyen: Reina Valera Gómez, RVR1960, NVI, NTV, DHH, TLA, RVC, LBLA ni otras ediciones con copyright. Se podrán añadir después, con permiso, solo con un archivo y una entrada de catálogo.

## Proceso de verificación

El script `scripts/convert-vpl.mjs`:

1. Descarga los archivos VPL desde eBible.org.
2. Importa solo códigos de libro del canon protestante (66 libros).
3. Comprueba que el conteo total de versículos sea coherente (>30 000 versículos por edición completa).
4. Genera `data/bibles/*.json` empaquetados en el instalador.

## Atribución

eBible.org — recursos bíblicos en múltiples formatos con información de licencia por traducción.
