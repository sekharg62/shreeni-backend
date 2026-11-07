import { INDIAN_STATES } from '../addresses/indian-states.js';

/*
 * Cleaning rules for the India Post "All India Pincode Directory" (data.gov.in).
 * Pure functions so the import script and the tests share them.
 */

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Old or alternative spellings in the dataset → today's name. */
const STATE_ALIASES: Record<string, (typeof INDIAN_STATES)[number]> = {
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  uttaranchal: 'Uttarakhand',
  'nct of delhi': 'Delhi',
  'new delhi': 'Delhi',
  'delhi nct': 'Delhi',
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'andaman nicobar islands': 'Andaman and Nicobar Islands',
  // Merged into one union territory in 2020.
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'jammu kashmir': 'Jammu and Kashmir',
  chattisgarh: 'Chhattisgarh',
  tamilnadu: 'Tamil Nadu',
  telengana: 'Telangana',
};

const STATE_BY_KEY = new Map<string, (typeof INDIAN_STATES)[number]>([
  ...INDIAN_STATES.map((s) => [key(s), s] as const),
  ...Object.entries(STATE_ALIASES),
]);

/** "WEST BENGAL" → "West Bengal"; "ORISSA" → "Odisha"; unknown → null. Always one of INDIAN_STATES. */
export function normalizeState(raw: string | undefined): (typeof INDIAN_STATES)[number] | null {
  if (!raw) return null;
  return STATE_BY_KEY.get(key(raw)) ?? null;
}

const SMALL_WORDS = new Set(['and', 'of', 'the', 'in', 'on', 'at', 'by']);

/** "NORTH 24 PARGANAS" → "North 24 Parganas"; "SOUTH ANDAMAN" → "South Andaman". */
export function titleCase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w, i) =>
      i > 0 && SMALL_WORDS.has(w)
        ? w
        : // capitalise after start, "(", "-", "." and "/" too: "Bara-bazar", "(east)"
          w.replace(/(^|[(\-./])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()),
    )
    .join(' ');
}

/** Valid Indian PIN: 6 digits, not starting with 0. */
export const isPincode = (s: string) => /^[1-9]\d{5}$/.test(s);

/** Split one CSV line (handles quotes and "" escapes). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
