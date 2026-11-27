import type { DateStr } from "./time";

export interface Holiday {
  date: DateStr;
  name: string;
}

const FIXED: [string, string][] = [
  ["01-01", "Nouvel an"],
  ["01-11", "Manifeste de l'indépendance"],
  ["01-14", "Nouvel an amazigh (Yennayer)"],
  ["05-01", "Fête du travail"],
  ["07-30", "Fête du Trône"],
  ["08-14", "Allégeance Oued Ed-Dahab"],
  ["08-20", "Révolution du Roi et du Peuple"],
  ["08-21", "Fête de la jeunesse"],
  ["10-31", "Fête de l'Unité"],
  ["11-06", "Marche verte"],
  ["11-18", "Fête de l'indépendance"],
];

/**
 * DECISION: Islamic holidays depend on the lunar calendar and the official moon sighting.
 * The dates below are estimates; the admin must confirm them each year (they are editable).
 */
const ISLAMIC: Record<number, [string, string][]> = {
  2025: [
    ["2025-03-31", "Aïd Al Fitr"], ["2025-04-01", "Aïd Al Fitr (2ᵉ jour)"],
    ["2025-06-07", "Aïd Al Adha"], ["2025-06-08", "Aïd Al Adha (2ᵉ jour)"],
    ["2025-06-27", "1er Moharram"],
    ["2025-09-05", "Aïd Al Mawlid"], ["2025-09-06", "Aïd Al Mawlid (2ᵉ jour)"],
  ],
  2026: [
    ["2026-03-20", "Aïd Al Fitr"], ["2026-03-21", "Aïd Al Fitr (2ᵉ jour)"],
    ["2026-05-27", "Aïd Al Adha"], ["2026-05-28", "Aïd Al Adha (2ᵉ jour)"],
    ["2026-06-16", "1er Moharram"],
    ["2026-08-25", "Aïd Al Mawlid"], ["2026-08-26", "Aïd Al Mawlid (2ᵉ jour)"],
  ],
  2027: [
    ["2027-03-10", "Aïd Al Fitr"], ["2027-03-11", "Aïd Al Fitr (2ᵉ jour)"],
    ["2027-05-17", "Aïd Al Adha"], ["2027-05-18", "Aïd Al Adha (2ᵉ jour)"],
    ["2027-06-06", "1er Moharram"],
    ["2027-08-15", "Aïd Al Mawlid"], ["2027-08-16", "Aïd Al Mawlid (2ᵉ jour)"],
  ],
};

export function moroccanHolidays(year: number): Holiday[] {
  const fixed = FIXED.map(([md, name]) => ({ date: `${year}-${md}`, name }));
  const islamic = (ISLAMIC[year] ?? []).map(([date, name]) => ({ date, name }));
  return [...fixed, ...islamic].sort((a, b) => (a.date < b.date ? -1 : 1));
}
