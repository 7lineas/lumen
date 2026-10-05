# Importar sus propias Biblias

**Biblias → Mis biblias → Importar Biblia…** abre un selector de archivos. Lumen lee el archivo, muestra una vista previa (libros, capítulos y versículos) y pide cuatro datos:

| Campo | Regla |
| --- | --- |
| Nombre | 2–80 caracteres |
| Abreviatura | 2–12 caracteres, única (sale en el selector y en la proyección) |
| Idioma | código, por ejemplo `es`, `en`, `pt` |
| Copyright o licencia | **obligatorio**; se muestra en el pie de la proyección. Usted es responsable de tener permiso para usar el texto |

La Biblia se guarda en la carpeta de datos de la aplicación (`userData/bibles/custom-<abreviatura>.json`), funciona sin internet y aparece en el selector de versión, grupo **Mis biblias**. **Quitar** la elimina. Solo se importan los 66 libros del canon protestante; los demás se omiten con un aviso. Se pueden elegir varios archivos a la vez (por ejemplo un USFM por libro). Límite: 80 MB por archivo; se lee UTF-8 o, si no es válido, Windows-1252.

## Formatos admitidos

| Formato | Extensión | Notas |
| --- | --- | --- |
| JSON de Lumen | `.json` | ver abajo |
| Zefania XML | `.xml` (`<XMLBIBLE>`) | libros por `bnumber` (1–66) o nombre; notas (`<NOTE>`) descartadas; nombre, identificador, idioma y derechos se leen de `<INFORMATION>` |
| OSIS XML | `.xml` (`<osisText>`) | versículos envueltos (`<verse osisID>`) o con hitos (`sID`/`eID`); notas y títulos descartados; metadatos de `<header>` |
| USFM | `.usfm` `.sfm` | `\id`, `\c`, `\v` (rangos `\v 1-2`); notas al pie, referencias cruzadas, encabezados y marcas de carácter se limpian |
| CSV / TSV | `.csv` `.tsv` | columnas `libro,capítulo,versículo,texto` con o sin encabezado, o dos columnas `referencia,texto` (`Juan 3:16`); delimitador `,` `;` o tabulador; comillas con saltos de línea |

No incluidos (no hay lector gratuito y fiable sin dependencias nativas): USX, módulos de theWord (`.ont/.nt`), MySword y e-Sword (`.bbl`, SQLite). Se pueden convertir a USFM, Zefania o CSV con las herramientas de cada programa.

Los libros se reconocen por código USFM/OSIS (`JHN`, `John`), nombre en español o inglés (`Juan`, `1 Corintios`, `I John`) o posición 1–66 (solo en CSV y Zefania).

## JSON de Lumen

```json
{
  "meta": { "name": "Mi Biblia", "abbr": "MIB", "language": "es", "copyright": "Dominio público" },
  "verses": {
    "GEN": { "1": { "1": "En el principio…", "2": "Y la tierra…" } },
    "JHN": { "3": { "16": "Porque de tal manera…" } }
  }
}
```

- `meta` es opcional y solo rellena los campos del formulario (usted los confirma). También puede poner `name`, `abbr`, `language`, `copyright` en la raíz.
- `verses`: libro → capítulo → versículo → texto. El libro puede ser el código USFM o un nombre reconocido; capítulos y versículos son números como texto.
- Si no hay `verses`, los libros pueden ir directamente en la raíz (`{ "Génesis": { "1": { "1": "…" } }, "S. Mateo": { … } }`), como en muchos JSON descargados; las claves sueltas que no son libros (por ejemplo `"lang": "SPAN"`) se ignoran. Se reconocen también los evangelios escritos `S. Mateo`, `S.Juan`, `San Lucas`, etc.
- También se acepta una lista plana: `[{ "book": "JHN", "chapter": 3, "verse": 16, "text": "…" }]`.
- Es el mismo esquema (`BibleData`) de los módulos que descarga Lumen; el archivo guardado además trae `searchIndex` para la búsqueda.

Ejemplos de cada formato: `shared/bible-import/fixtures/`.
