/**
 * Load India Post PIN codes into the State → District → Pincode tables.
 *
 *   npm run db:import-pincodes                       # prisma/data/pincodes.csv (or pincode.csv)
 *   npm run db:import-pincodes -- path/to/file.csv
 *   npm run db:import-pincodes -- --dry-run          # parse and report, write nothing
 *
 * Source: data.gov.in "All India Pincode Directory" (CSV, one row per post office).
 * Re-runnable: everything is written in one transaction. States and districts keep their ids
 * across runs; PIN codes are replaced; districts no longer used are removed.
 */
import 'dotenv/config';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { INDIAN_STATES } from '../modules/addresses/indian-states.js';
import { isPincode, normalizeState, parseCsvLine, titleCase } from '../modules/pincodes/pincode-normalize.js';

const BATCH = 2000;
const DEFAULT_FILES = ['prisma/data/pincodes.csv', 'prisma/data/pincode.csv'];

/** Column names differ between dataset versions ("districtname" vs "district", "Deliverystatus" vs "delivery"). */
const COLUMNS = {
  pincode: ['pincode', 'pin', 'pincodes'],
  district: ['district', 'districtname'],
  state: ['statename', 'state'],
  circle: ['circlename', 'circle'],
} as const;

type Col = keyof typeof COLUMNS;

function mapHeader(header: string[]): Record<Col, number> {
  const norm = header.map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const out = {} as Record<Col, number>;
  for (const [col, names] of Object.entries(COLUMNS) as [Col, readonly string[]][]) {
    out[col] = norm.findIndex((h) => names.includes(h));
  }
  const missing = (['pincode', 'district', 'state'] as Col[]).filter((c) => out[c] < 0);
  if (missing.length) {
    throw new Error(`CSV is missing column(s): ${missing.join(', ')}. Found: ${header.join(', ')}`);
  }
  return out;
}

type Group = {
  states: Map<string, number>;
  /** Used only when no row gives a state: "Bihar Circle" → Bihar. */
  circleStates: Map<string, number>;
  /** "state|district" → count */
  districts: Map<string, number>;
};

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const mostCommon = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
const isNA = (s: string | undefined) => !s || /^n\.?\s*a\.?$/i.test(s.trim());
const fmt = (n: number) => n.toLocaleString('en-IN');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--')) ?? DEFAULT_FILES.find((f) => existsSync(f)) ?? DEFAULT_FILES[0];
  if (!existsSync(file)) {
    console.error(`✖ ${file} not found. Download "All India Pincode Directory" (CSV) from data.gov.in and save it there.`);
    process.exit(1);
  }
  console.log(`Reading ${file} …`);

  const groups = new Map<string, Group>();
  const unknownStates = new Map<string, number>();
  let rows = 0;
  let skipped = 0;
  let cols: Record<Col, number> | null = null;

  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const raw of lines) {
    const line = raw.replace(/^\uFEFF/, ''); // byte-order mark
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!cols) {
      cols = mapHeader(cells);
      continue;
    }
    rows++;
    const pin = cells[cols.pincode]?.replace(/\D/g, '') ?? '';
    if (!isPincode(pin)) {
      skipped++;
      continue;
    }

    let g = groups.get(pin);
    if (!g) groups.set(pin, (g = { states: new Map(), circleStates: new Map(), districts: new Map() }));

    const rawState = cells[cols.state];
    const state = normalizeState(rawState);
    if (state) {
      bump(g.states, state);
      const district = cells[cols.district];
      if (!isNA(district)) bump(g.districts, `${state}|${titleCase(district)}`);
    } else {
      if (!isNA(rawState)) bump(unknownStates, rawState);
      const circle = cols.circle >= 0 ? normalizeState(cells[cols.circle]?.replace(/\s*circle\s*$/i, '')) : null;
      if (circle) bump(g.circleStates, circle);
    }
  }

  // One record per PIN code.
  let fromCircle = 0;
  let noDistrict = 0;
  const unresolved: string[] = [];
  const records: { pincode: string; state: string; district: string | null }[] = [];
  for (const [pincode, g] of groups) {
    let state = mostCommon(g.states);
    if (!state) {
      state = mostCommon(g.circleStates);
      if (state) fromCircle++;
    }
    if (!state) {
      unresolved.push(pincode); // tried again below, from neighbouring PIN codes
      continue;
    }
    // Most common district within the chosen state.
    const inState = new Map([...g.districts].filter(([k]) => k.startsWith(`${state}|`)));
    const key = mostCommon(inState);
    const district = key ? key.slice(state.length + 1) : null;
    if (!district) noDistrict++;
    records.push({ pincode, state, district });
  }
  // Last resort: the first 3 digits are India Post's sorting district, so use the state most
  // PIN codes with the same prefix belong to (e.g. 795xxx → Manipur).
  const prefixStates = new Map<string, Map<string, number>>();
  for (const r of records) {
    const p = r.pincode.slice(0, 3);
    if (!prefixStates.has(p)) prefixStates.set(p, new Map());
    bump(prefixStates.get(p)!, r.state);
  }
  let fromPrefix = 0;
  for (const pincode of unresolved.splice(0)) {
    const state = mostCommon(prefixStates.get(pincode.slice(0, 3)) ?? new Map());
    if (!state) {
      unresolved.push(pincode);
      continue;
    }
    fromPrefix++;
    noDistrict++;
    records.push({ pincode, state, district: null });
  }
  records.sort((a, b) => a.pincode.localeCompare(b.pincode));
  const districtKeys = [...new Set(records.filter((r) => r.district).map((r) => `${r.state}|${r.district}`))];

  console.log(
    `Read ${fmt(rows)} rows → ${fmt(records.length)} PIN codes, ${fmt(districtKeys.length)} districts (${fmt(skipped)} invalid rows skipped).`,
  );
  if (fromCircle) console.log(`  ${fmt(fromCircle)} PIN codes had no state in the data; taken from the postal circle.`);
  if (fromPrefix) console.log(`  ${fmt(fromPrefix)} PIN codes had no state or single-state circle; taken from neighbouring PIN codes.`);
  if (noDistrict) console.log(`  ${fmt(noDistrict)} PIN codes have no district in the data (saved without one).`);
  if (unresolved.length) console.log(`  ${fmt(unresolved.length)} PIN codes skipped: no state could be worked out (e.g. ${unresolved.slice(0, 5).join(', ')}).`);
  if (unknownStates.size) console.log('  State names not recognised:', Object.fromEntries(unknownStates));
  const sample = records.find((r) => r.pincode === '743134') ?? records[0];
  if (sample) console.log('Sample:', sample);
  if (dryRun) {
    console.log('Dry run: nothing written.');
    return;
  }
  if (records.length === 0) throw new Error('No PIN codes parsed; refusing to empty the table.');

  // Session connection (not the pooler) for one long transaction.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
  });
  try {
    await prisma.$transaction(
      async (tx) => {
        // 1. All 36 states (existing ones keep their ids).
        await tx.state.createMany({ data: INDIAN_STATES.map((name) => ({ name })), skipDuplicates: true });
        const stateId = new Map((await tx.state.findMany({ select: { id: true, name: true } })).map((s) => [s.name, s.id]));

        // 2. Districts: add new ones; existing ones keep their ids.
        await tx.district.createMany({
          data: districtKeys.map((k) => {
            const [state, name] = k.split('|');
            return { stateId: stateId.get(state)!, name };
          }),
          skipDuplicates: true,
        });
        const districtId = new Map(
          (await tx.district.findMany({ select: { id: true, name: true, state: { select: { name: true } } } })).map((d) => [
            `${d.state.name}|${d.name}`,
            d.id,
          ]),
        );
        console.log(`States: ${stateId.size}. Districts: ${fmt(districtId.size)}.`);

        // 3. PIN codes: replace.
        await tx.pincode.deleteMany();
        for (let i = 0; i < records.length; i += BATCH) {
          await tx.pincode.createMany({
            data: records.slice(i, i + BATCH).map((r) => ({
              pincode: r.pincode,
              stateId: stateId.get(r.state)!,
              districtId: r.district ? (districtId.get(`${r.state}|${r.district}`) ?? null) : null,
            })),
          });
          process.stdout.write(`\rSaved ${fmt(Math.min(i + BATCH, records.length))} / ${fmt(records.length)} PIN codes`);
        }

        // 4. Districts no longer used by any PIN code.
        const { count } = await tx.district.deleteMany({ where: { pincodes: { none: {} } } });
        if (count) console.log(`\nRemoved ${count} unused districts.`);
      },
      { timeout: 10 * 60_000, maxWait: 30_000 },
    );
    const [states, districts, pincodes] = await Promise.all([prisma.state.count(), prisma.district.count(), prisma.pincode.count()]);
    console.log(`\n✔ Done: ${states} states, ${fmt(districts)} districts, ${fmt(pincodes)} PIN codes.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('✖ Import failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
