// Albania's 12 qarks (regions) with their main bashkia (municipalities).
// Used to power state/city dropdowns for Albania on the checkout screen.
export type AlbaniaQark = { name: string; bashkia: string[] };

export const ALBANIA_QARKS: AlbaniaQark[] = [
  {
    name: "Tiranë",
    bashkia: ["Tiranë", "Kamëz", "Vorë", "Kavajë", "Rrogozhinë"],
  },
  {
    name: "Durrës",
    bashkia: ["Durrës", "Krujë", "Shijak"],
  },
  {
    name: "Fier",
    bashkia: ["Fier", "Lushnjë", "Divjakë", "Roskovec", "Patos", "Mallakastër"],
  },
  {
    name: "Vlorë",
    bashkia: ["Vlorë", "Sarandë", "Himarë", "Delvinë", "Selenicë", "Konispol", "Finiq"],
  },
  {
    name: "Elbasan",
    bashkia: ["Elbasan", "Cërrik", "Peqin", "Belsh", "Gramsh", "Librazhd", "Prrenjas"],
  },
  {
    name: "Berat",
    bashkia: ["Berat", "Kuçovë", "Skrapar", "Poliçan", "Ura Vajgurore"],
  },
  {
    name: "Korçë",
    bashkia: ["Korçë", "Pogradec", "Devoll", "Kolonjë", "Maliq", "Pustec"],
  },
  {
    name: "Gjirokastër",
    bashkia: ["Gjirokastër", "Tepelenë", "Përmet", "Memaliaj", "Këlcyrë", "Libohovë", "Dropull"],
  },
  {
    name: "Shkodër",
    bashkia: ["Shkodër", "Malësi e Madhe", "Vau i Dejës", "Pukë", "Fushë-Arrëz"],
  },
  {
    name: "Lezhë",
    bashkia: ["Lezhë", "Kurbin", "Mirditë"],
  },
  {
    name: "Dibër",
    bashkia: ["Peshkopi", "Bulqizë", "Klos", "Mat"],
  },
  {
    name: "Kukës",
    bashkia: ["Kukës", "Has", "Tropojë"],
  },
];

export function bashkiaFor(qarkName: string): string[] {
  const q = ALBANIA_QARKS.find((x) => x.name.toLowerCase() === qarkName.trim().toLowerCase());
  return q?.bashkia || [];
}

// -----------------------------------------------------------------------------
// Fuzzy matching helpers for values returned by Google (e.g. "Durrës County",
// "Bashkia Tiranë", "Tirana", ...). Diacritic-insensitive prefix/substring match.
// -----------------------------------------------------------------------------

function fold(s: string): string {
  const base = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ë/g, "e")
    .replace(/ç/g, "c")
    .trim();
  // Strip trailing possessive/gender endings that differ between English
  // and Albanian spellings (Tirana ↔ Tiranë, Durrës ↔ Durres, Vlora ↔ Vlorë).
  return base.replace(/[sae]+$/g, "");
}

function strip(s: string): string {
  // Remove noise words Google adds
  const cleaned = s
    .replace(/\bqarku i\b/gi, "")
    .replace(/\bqarku\b/gi, "")
    .replace(/\bbashkia\b/gi, "")
    .replace(/\bcounty of\b/gi, "")
    .replace(/\bcounty\b/gi, "")
    .replace(/\bmunicipality\b/gi, "")
    .replace(/\bdistrict\b/gi, "")
    .replace(/\bprefecture\b/gi, "")
    .trim();
  return cleaned || s;
}

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // At least 4 shared prefix chars OR either contains the other.
  const min = Math.min(a.length, b.length, 4);
  if (a.slice(0, min) === b.slice(0, min)) return true;
  return a.includes(b) || b.includes(a);
}

/** Match a Google-returned admin_area_level_1 to one of Albania's 12 qarks. */
export function matchQark(input: string | null | undefined): string | null {
  if (!input) return null;
  const target = fold(strip(input));
  if (!target) return null;
  const exact = ALBANIA_QARKS.find((q) => fold(q.name) === target);
  if (exact) return exact.name;
  const partial = ALBANIA_QARKS.find((q) => similar(fold(q.name), target));
  return partial?.name || null;
}

/** Match a Google-returned city (locality) to a bashkia within an optional qark. */
export function matchBashkia(cityInput: string | null | undefined, qark?: string | null): string | null {
  if (!cityInput) return null;
  const target = fold(strip(cityInput));
  if (!target) return null;
  const candidates: string[] = [];
  if (qark) {
    candidates.push(...bashkiaFor(qark));
  } else {
    ALBANIA_QARKS.forEach((q) => candidates.push(...q.bashkia));
  }
  const exact = candidates.find((b) => fold(b) === target);
  if (exact) return exact;
  const partial = candidates.find((b) => similar(fold(b), target));
  return partial || null;
}
