/** Protestant canon — 66 books, USFM codes */
export interface BookMeta {
  code: string;
  name: string;
  abbrev: string[];
  testament: "OT" | "NT";
  chapters: number;
}

export const BOOKS: BookMeta[] = [
  { code: "GEN", name: "Génesis", abbrev: ["gen", "gn"], testament: "OT", chapters: 50 },
  { code: "EXO", name: "Éxodo", abbrev: ["exo", "ex"], testament: "OT", chapters: 40 },
  { code: "LEV", name: "Levítico", abbrev: ["lev", "lv"], testament: "OT", chapters: 27 },
  { code: "NUM", name: "Números", abbrev: ["num", "nm"], testament: "OT", chapters: 36 },
  { code: "DEU", name: "Deuteronomio", abbrev: ["deu", "dt", "deut"], testament: "OT", chapters: 34 },
  { code: "JOS", name: "Josué", abbrev: ["jos"], testament: "OT", chapters: 24 },
  { code: "JDG", name: "Jueces", abbrev: ["jdg", "jue"], testament: "OT", chapters: 21 },
  { code: "RUT", name: "Rut", abbrev: ["rut"], testament: "OT", chapters: 4 },
  { code: "1SA", name: "1 Samuel", abbrev: ["1sa", "1 sam", "1sam"], testament: "OT", chapters: 31 },
  { code: "2SA", name: "2 Samuel", abbrev: ["2sa", "2 sam", "2sam"], testament: "OT", chapters: 24 },
  { code: "1KI", name: "1 Reyes", abbrev: ["1ki", "1 re", "1re"], testament: "OT", chapters: 22 },
  { code: "2KI", name: "2 Reyes", abbrev: ["2ki", "2 re", "2re"], testament: "OT", chapters: 25 },
  { code: "1CH", name: "1 Crónicas", abbrev: ["1ch", "1 cro", "1cro"], testament: "OT", chapters: 29 },
  { code: "2CH", name: "2 Crónicas", abbrev: ["2ch", "2 cro", "2cro"], testament: "OT", chapters: 36 },
  { code: "EZR", name: "Esdras", abbrev: ["ezr", "esd"], testament: "OT", chapters: 10 },
  { code: "NEH", name: "Nehemías", abbrev: ["neh", "nee"], testament: "OT", chapters: 13 },
  { code: "EST", name: "Ester", abbrev: ["est"], testament: "OT", chapters: 10 },
  { code: "JOB", name: "Job", abbrev: ["job"], testament: "OT", chapters: 42 },
  { code: "PSA", name: "Salmos", abbrev: ["psa", "sal", "salmo", "salmos", "ps"], testament: "OT", chapters: 150 },
  { code: "PRO", name: "Proverbios", abbrev: ["pro", "pr"], testament: "OT", chapters: 31 },
  { code: "ECC", name: "Eclesiastés", abbrev: ["ecc", "ecl"], testament: "OT", chapters: 12 },
  { code: "SNG", name: "Cantares", abbrev: ["sng", "cant"], testament: "OT", chapters: 8 },
  { code: "ISA", name: "Isaías", abbrev: ["isa", "is"], testament: "OT", chapters: 66 },
  { code: "JER", name: "Jeremías", abbrev: ["jer"], testament: "OT", chapters: 52 },
  { code: "LAM", name: "Lamentaciones", abbrev: ["lam"], testament: "OT", chapters: 5 },
  { code: "EZK", name: "Ezequiel", abbrev: ["ezk", "eze"], testament: "OT", chapters: 48 },
  { code: "DAN", name: "Daniel", abbrev: ["dan"], testament: "OT", chapters: 12 },
  { code: "HOS", name: "Oseas", abbrev: ["hos", "ose"], testament: "OT", chapters: 14 },
  { code: "JOL", name: "Joel", abbrev: ["jol"], testament: "OT", chapters: 3 },
  { code: "AMO", name: "Amós", abbrev: ["amo"], testament: "OT", chapters: 9 },
  { code: "OBA", name: "Abdías", abbrev: ["oba", "abd"], testament: "OT", chapters: 1 },
  { code: "JON", name: "Jonás", abbrev: ["jon"], testament: "OT", chapters: 4 },
  { code: "MIC", name: "Miqueas", abbrev: ["mic", "miq"], testament: "OT", chapters: 7 },
  { code: "NAM", name: "Nahúm", abbrev: ["nam", "nah"], testament: "OT", chapters: 3 },
  { code: "HAB", name: "Habacuc", abbrev: ["hab"], testament: "OT", chapters: 3 },
  { code: "ZEP", name: "Sofonías", abbrev: ["zep", "sof"], testament: "OT", chapters: 3 },
  { code: "HAG", name: "Hageo", abbrev: ["hag"], testament: "OT", chapters: 2 },
  { code: "ZEC", name: "Zacarías", abbrev: ["zec", "zac"], testament: "OT", chapters: 14 },
  { code: "MAL", name: "Malaquías", abbrev: ["mal"], testament: "OT", chapters: 4 },
  { code: "MAT", name: "Mateo", abbrev: ["mat", "mt"], testament: "NT", chapters: 28 },
  { code: "MRK", name: "Marcos", abbrev: ["mrk", "mar", "mc"], testament: "NT", chapters: 16 },
  { code: "LUK", name: "Lucas", abbrev: ["luk", "luc", "lc"], testament: "NT", chapters: 24 },
  { code: "JHN", name: "Juan", abbrev: ["jhn", "jn", "ju"], testament: "NT", chapters: 21 },
  { code: "ACT", name: "Hechos", abbrev: ["act", "hech", "hc"], testament: "NT", chapters: 28 },
  { code: "ROM", name: "Romanos", abbrev: ["rom", "ro"], testament: "NT", chapters: 16 },
  { code: "1CO", name: "1 Corintios", abbrev: ["1co", "1 cor", "1cor"], testament: "NT", chapters: 16 },
  { code: "2CO", name: "2 Corintios", abbrev: ["2co", "2 cor", "2cor"], testament: "NT", chapters: 13 },
  { code: "GAL", name: "Gálatas", abbrev: ["gal", "ga"], testament: "NT", chapters: 6 },
  { code: "EPH", name: "Efesios", abbrev: ["eph", "ef"], testament: "NT", chapters: 6 },
  { code: "PHP", name: "Filipenses", abbrev: ["php", "fil", "flp"], testament: "NT", chapters: 4 },
  { code: "COL", name: "Colosenses", abbrev: ["col"], testament: "NT", chapters: 4 },
  { code: "1TH", name: "1 Tesalonicenses", abbrev: ["1th", "1 tes", "1tes"], testament: "NT", chapters: 5 },
  { code: "2TH", name: "2 Tesalonicenses", abbrev: ["2th", "2 tes", "2tes"], testament: "NT", chapters: 3 },
  { code: "1TI", name: "1 Timoteo", abbrev: ["1ti", "1 tim", "1tim"], testament: "NT", chapters: 6 },
  { code: "2TI", name: "2 Timoteo", abbrev: ["2ti", "2 tim", "2tim"], testament: "NT", chapters: 4 },
  { code: "TIT", name: "Tito", abbrev: ["tit"], testament: "NT", chapters: 3 },
  { code: "PHM", name: "Filemón", abbrev: ["phm", "flm"], testament: "NT", chapters: 1 },
  { code: "HEB", name: "Hebreos", abbrev: ["heb"], testament: "NT", chapters: 13 },
  { code: "JAS", name: "Santiago", abbrev: ["jas", "stg"], testament: "NT", chapters: 5 },
  { code: "1PE", name: "1 Pedro", abbrev: ["1pe", "1 ped", "1ped"], testament: "NT", chapters: 5 },
  { code: "2PE", name: "2 Pedro", abbrev: ["2pe", "2 ped", "2ped"], testament: "NT", chapters: 3 },
  { code: "1JN", name: "1 Juan", abbrev: ["1jn", "1 jn", "1ju"], testament: "NT", chapters: 5 },
  { code: "2JN", name: "2 Juan", abbrev: ["2jn", "2 jn"], testament: "NT", chapters: 1 },
  { code: "3JN", name: "3 Juan", abbrev: ["3jn", "3 jn"], testament: "NT", chapters: 1 },
  { code: "JUD", name: "Judas", abbrev: ["jud"], testament: "NT", chapters: 1 },
  { code: "REV", name: "Apocalipsis", abbrev: ["rev", "apo", "ap"], testament: "NT", chapters: 22 },
];

export const BOOK_BY_CODE = new Map(BOOKS.map((b) => [b.code, b]));

export function bookDisplayName(code: string): string {
  return BOOK_BY_CODE.get(code)?.name ?? code;
}
