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
