/**
 * Demo catalogue for testing the storefront: 40 published sarees across the 8 sub-categories,
 * each with Unsplash photos, a Free Size variant, specs, colour/tag links, 4 related products
 * and 10–15 approved reviews.
 *
 *   npm run db:seed-demo              # (re)create the demo set — replaces any previous demo set
 *   npm run db:seed-demo -- --remove  # delete every demo product (and its images, reviews, …)
 *
 * Demo products are recognised by their variant SKU prefix "DEMO-" (never shown to shoppers).
 * Photos are free Unsplash images (Unsplash License), hot-linked from images.unsplash.com.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const SKU_PREFIX = 'DEMO-';

/* ───────────── Deterministic randomness (same data every run) ───────────── */
let seed = 20261108;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
};
/** Re-seed from a string, so each product's prices/stock/reviews stay the same when the list grows. */
const seedFrom = (text: string) => {
  seed = [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2 ** 32, 7);
};
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const shuffle = <T>(xs: readonly T[]): T[] => [...xs].sort(() => rand() - 0.5);

/* ───────────── Photos (verified to load) ───────────── */
const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`;
const PHOTOS = {
  redGoldBridal: unsplash('1769500804057-ca1391bf4617'),
  pinkBlackSilk: unsplash('1742287724816-4a8a1cc7ad5c'),
  classic: unsplash('1727430228383-aa1fb59db8bf'),
  green: unsplash('1679006831648-7c9ea12e5807'),
  pinkOrange: unsplash('1617627143750-d86bc21e42bb'),
  redBrown: unsplash('1610030469983-98e550d6193c'),
  purpleGold: unsplash('1641699862936-be9f49b1c38d'),
  colourful: unsplash('1692992193981-d3d92fabd9cb'),
  redWhite: unsplash('1619516388835-2b60acc4049e'),
  blueYellow: unsplash('1610189012906-4c0aa9b9781e'),
  blueYellow2: unsplash('1610189013429-a703f4b245cf'),
  // Second batch
  brickRed: unsplash('1610030469839-f909584b43f1'),
  redYellow: unsplash('1609748341932-f0206c09412b'),
  group: unsplash('1610189026205-27510cfc52f8'),
  blueRed: unsplash('1609748513078-9ff6232781c5'),
  scarlet: unsplash('1646979200020-941e1deb2670'),
  pinkBlue: unsplash('1710967074868-2041e4f44c17'),
  blackWhite: unsplash('1572470176170-98fa8abcb741'),
  park: unsplash('1739429942851-9083ee185d3d'),
  purpleBlue: unsplash('1710967075806-327bc44da2cb'),
  cobalt: unsplash('1693023656257-87c142566ad3'),
  leafGreen: unsplash('1770838447151-05a876cdee3d'),
  yellowRed: unsplash('1610189337543-1c5d8e64f574'),
  teal: unsplash('1610030469245-ab65c4583802'),
  redGreen: unsplash('1610030469069-cb6620bea733'),
  lavender: unsplash('1610189026297-df356264479c'),
  terracotta: unsplash('1628477116196-48afe0d209e0'),
  mint: unsplash('1739429945610-95901c2baf18'),
  sunflower: unsplash('1723922694741-d4faf396bab1'),
  maroonGold: unsplash('1769500801406-d5abac0429c3'),
  wine: unsplash('1769500805415-0f9485e70e5b'),
  vermilion: unsplash('1771992204137-23ad12a8fb9c'),
  whiteRed: unsplash('1678705730064-a7ecbab4b3fb'),
  ruby: unsplash('1600312914724-0c318dd0eb29'),
  wedding: unsplash('1570212773364-e30cd076539e'),
} as const;
type Photo = keyof typeof PHOTOS;
const ALL_PHOTOS = Object.keys(PHOTOS) as Photo[];

/* ───────────── Catalogue ───────────── */
type Weave = { fabric: string; silk: boolean; hsn: string; price: [number, number]; story: string };
const WEAVES: Record<string, Weave> = {
  baluchori: {
    fabric: 'Pure silk',
    silk: true,
    hsn: '5007',
    price: [12999, 18999],
    story: 'Woven in Bishnupur, its pallu tells a story in thread — scenes from epics and temple life, one pass at a time.',
  },
  swarnachori: {
    fabric: 'Pure silk with zari',
    silk: true,
    hsn: '5007',
    price: [19999, 24999],
    story: 'Baluchori’s festive sibling: gold-toned zari lights up every motif, made for weddings and celebrations.',
  },
  'murshidabad-silk': {
    fabric: 'Mulberry silk',
    silk: true,
    hsn: '5007',
    price: [6999, 9999],
    story: 'Soft, lustrous Murshidabad mulberry silk that drapes beautifully and carries colour with depth.',
  },
  'kantha-stitch': {
    fabric: 'Tussar silk',
    silk: true,
    hsn: '5007',
    price: [7999, 11999],
    story: 'Thousands of hand-made running stitches turn plain silk into texture, pattern and story.',
  },
  'bishnupuri-silk': {
    fabric: 'Bishnupuri silk',
    silk: true,
    hsn: '5007',
    price: [5999, 8999],
    story: 'Light, smooth silk from the temple town of Bishnupur — elegant for occasions, easy to wear.',
  },
  handloom: {
    fabric: 'Handloom cotton',
    silk: false,
    hsn: '5208',
    price: [1999, 3499],
    story: 'Woven on a hand-operated loom, with the small irregularities that show a person, not a machine, made it.',
  },
  jamdani: {
    fabric: 'Fine cotton',
    silk: false,
    hsn: '5208',
    price: [3999, 7999],
    story: 'Airy cotton with motifs that seem to float, added by hand on the loom one pattern thread at a time.',
  },
  tant: {
    fabric: 'Bengal cotton',
    silk: false,
    hsn: '5208',
    price: [1999, 2799],
    story: 'Bengal’s everyday cotton: light, crisp and cool, with bold borders made for warm days.',
  },
};

type Item = { name: string; category: keyof typeof WEAVES; photo: Photo };
const PRODUCTS: Item[] = [
  { name: 'Crimson Baluchori Silk Saree', category: 'baluchori', photo: 'redGoldBridal' },
  { name: 'Royal Purple Baluchori Saree', category: 'baluchori', photo: 'purpleGold' },
  { name: 'Rust Baluchori Temple Pallu Saree', category: 'baluchori', photo: 'redBrown' },
  { name: 'Rose Gold Swarnachori Silk Saree', category: 'swarnachori', photo: 'pinkOrange' },
  { name: 'Maroon Swarnachori Wedding Saree', category: 'swarnachori', photo: 'redGoldBridal' },
  { name: 'Blush Pink Murshidabad Silk Saree', category: 'murshidabad-silk', photo: 'pinkBlackSilk' },
  { name: 'Emerald Murshidabad Silk Saree', category: 'murshidabad-silk', photo: 'green' },
  { name: 'Indigo Printed Murshidabad Silk Saree', category: 'murshidabad-silk', photo: 'blueYellow' },
  { name: 'Multicolour Kantha Stitch Silk Saree', category: 'kantha-stitch', photo: 'colourful' },
  { name: 'Sunset Orange Kantha Stitch Saree', category: 'kantha-stitch', photo: 'pinkOrange' },
  { name: 'Violet Bishnupuri Silk Saree', category: 'bishnupuri-silk', photo: 'purpleGold' },
  { name: 'Sky Blue Bishnupuri Silk Saree', category: 'bishnupuri-silk', photo: 'blueYellow2' },
  { name: 'Red and White Handloom Cotton Saree', category: 'handloom', photo: 'redWhite' },
  { name: 'Mustard Handloom Cotton Saree', category: 'handloom', photo: 'blueYellow2' },
  { name: 'Bottle Green Handloom Saree', category: 'handloom', photo: 'green' },
  { name: 'Ivory Jamdani Cotton Saree', category: 'jamdani', photo: 'redWhite' },
  { name: 'Peacock Blue Jamdani Saree', category: 'jamdani', photo: 'blueYellow' },
  { name: 'Pink Floral Jamdani Saree', category: 'jamdani', photo: 'pinkBlackSilk' },
  { name: 'Classic Red Border Tant Saree', category: 'tant', photo: 'redWhite' },
  { name: 'Festive Colourful Tant Saree', category: 'tant', photo: 'colourful' },
  // Second batch: each with its own main photo
  { name: 'Brick Red Baluchori Silk Saree', category: 'baluchori', photo: 'brickRed' },
  { name: 'Parrot Green Border Baluchori Saree', category: 'baluchori', photo: 'redGreen' },
  { name: 'Wine Red Baluchori Wedding Saree', category: 'baluchori', photo: 'wine' },
  { name: 'Marigold Swarnachori Festive Saree', category: 'swarnachori', photo: 'redYellow' },
  { name: 'Maroon Gold Swarnachori Bridal Saree', category: 'swarnachori', photo: 'maroonGold' },
  { name: 'Vermilion Swarnachori Silk Saree', category: 'swarnachori', photo: 'vermilion' },
  { name: 'Navy and Red Murshidabad Silk Saree', category: 'murshidabad-silk', photo: 'blueRed' },
  { name: 'Twilight Purple Murshidabad Silk Saree', category: 'murshidabad-silk', photo: 'purpleBlue' },
  { name: 'Ruby Murshidabad Silk Saree', category: 'murshidabad-silk', photo: 'ruby' },
  { name: 'Scarlet Bishnupuri Silk Saree', category: 'bishnupuri-silk', photo: 'scarlet' },
  { name: 'Teal Bishnupuri Silk Saree', category: 'bishnupuri-silk', photo: 'teal' },
  { name: 'Monochrome Kantha Stitch Saree', category: 'kantha-stitch', photo: 'blackWhite' },
  { name: 'Lavender Floral Kantha Stitch Saree', category: 'kantha-stitch', photo: 'lavender' },
  { name: 'Turmeric Yellow Handloom Saree', category: 'handloom', photo: 'yellowRed' },
  { name: 'Mint and White Handloom Saree', category: 'handloom', photo: 'mint' },
  { name: 'Candy Pink Jamdani Saree', category: 'jamdani', photo: 'pinkBlue' },
  { name: 'Leaf Green Jamdani Saree', category: 'jamdani', photo: 'leafGreen' },
  { name: 'White and Red Jamdani Saree', category: 'jamdani', photo: 'whiteRed' },
  { name: 'Cobalt Blue Tant Saree', category: 'tant', photo: 'cobalt' },
  { name: 'Terracotta Tant Saree', category: 'tant', photo: 'terracotta' },
];

/** Shown first on listings. */
const FEATURED = new Set([
  'Indigo Printed Murshidabad Silk Saree',
  'Ivory Jamdani Cotton Saree',
  'Emerald Murshidabad Silk Saree',
  'Pink Floral Jamdani Saree',
  'Maroon Gold Swarnachori Bridal Saree',
  'Candy Pink Jamdani Saree',
]);
/** Stock 0, to test the "Out of stock" states. */
const SOLD_OUT = new Set(['Crimson Baluchori Silk Saree', 'Classic Red Border Tant Saree', 'Monochrome Kantha Stitch Saree']);

/* ───────────── Colours & tags ───────────── */
/** Saree colour palette (matched by name, case-insensitive; existing colours are kept as they are). */
const PALETTE: [name: string, hex: string | null][] = [
  ['Red', '#c8102e'], ['Maroon', '#7b1e2b'], ['Wine', '#6d1a36'], ['Rust', '#b7410e'], ['Orange', '#e8772e'],
  ['Mustard', '#d4a017'], ['Yellow', '#f2c230'], ['Gold', '#c9a227'], ['Ivory', '#fffff0'], ['White', '#ffffff'],
  ['Black', '#1f1f1f'], ['Grey', '#8a8a8a'], ['Green', '#2e7d32'], ['Emerald', '#046307'], ['Mint', '#98d7c2'],
  ['Teal', '#00807f'], ['Sky Blue', '#87ceeb'], ['Blue', '#1e49a8'], ['Navy', '#1b2a4a'], ['Purple', '#6a2c91'],
  ['Lavender', '#b497d6'], ['Pink', '#e75480'], ['Light Pink', '#f8c8d8'], ['Peach', '#f6b38f'], ['Multicolour', null],
];

/** [primary, secondary?] colour for each demo saree. */
const PRODUCT_COLORS: Record<string, [string, string?]> = {
  'Crimson Baluchori Silk Saree': ['Red', 'Gold'],
  'Royal Purple Baluchori Saree': ['Purple', 'Gold'],
  'Rust Baluchori Temple Pallu Saree': ['Rust', 'Maroon'],
  'Rose Gold Swarnachori Silk Saree': ['Pink', 'Gold'],
  'Maroon Swarnachori Wedding Saree': ['Maroon', 'Gold'],
  'Blush Pink Murshidabad Silk Saree': ['Light Pink', 'Black'],
  'Emerald Murshidabad Silk Saree': ['Emerald', 'Gold'],
  'Indigo Printed Murshidabad Silk Saree': ['Navy', 'Yellow'],
  'Multicolour Kantha Stitch Silk Saree': ['Multicolour'],
  'Sunset Orange Kantha Stitch Saree': ['Orange', 'Pink'],
  'Violet Bishnupuri Silk Saree': ['Purple', 'Gold'],
  'Sky Blue Bishnupuri Silk Saree': ['Sky Blue', 'Yellow'],
  'Red and White Handloom Cotton Saree': ['Red', 'White'],
  'Mustard Handloom Cotton Saree': ['Mustard', 'Blue'],
  'Bottle Green Handloom Saree': ['Green', 'Gold'],
  'Ivory Jamdani Cotton Saree': ['Ivory', 'Red'],
  'Peacock Blue Jamdani Saree': ['Teal', 'Yellow'],
  'Pink Floral Jamdani Saree': ['Pink', 'Black'],
  'Classic Red Border Tant Saree': ['White', 'Red'],
  'Festive Colourful Tant Saree': ['Multicolour'],
  'Brick Red Baluchori Silk Saree': ['Rust', 'Gold'],
  'Parrot Green Border Baluchori Saree': ['Red', 'Green'],
  'Wine Red Baluchori Wedding Saree': ['Wine', 'Gold'],
  'Marigold Swarnachori Festive Saree': ['Yellow', 'Red'],
  'Maroon Gold Swarnachori Bridal Saree': ['Maroon', 'Gold'],
  'Vermilion Swarnachori Silk Saree': ['Red', 'Gold'],
  'Navy and Red Murshidabad Silk Saree': ['Navy', 'Red'],
  'Twilight Purple Murshidabad Silk Saree': ['Purple', 'Blue'],
  'Ruby Murshidabad Silk Saree': ['Red', 'Gold'],
  'Scarlet Bishnupuri Silk Saree': ['Red'],
  'Teal Bishnupuri Silk Saree': ['Teal', 'Green'],
  'Monochrome Kantha Stitch Saree': ['Black', 'White'],
  'Lavender Floral Kantha Stitch Saree': ['Lavender', 'White'],
  'Turmeric Yellow Handloom Saree': ['Yellow', 'Red'],
  'Mint and White Handloom Saree': ['Mint', 'White'],
  'Candy Pink Jamdani Saree': ['Pink', 'Blue'],
  'Leaf Green Jamdani Saree': ['Green'],
  'White and Red Jamdani Saree': ['White', 'Red'],
  'Cobalt Blue Tant Saree': ['Blue', 'Yellow'],
  'Terracotta Tant Saree': ['Rust', 'Peach'],
};

/** Tags (matched by slug; existing tags keep their name and colour). */
const TAGS: { slug: string; name: string; color: string }[] = [
  { slug: 'silk', name: 'Silk', color: '#ff0000' },
  { slug: 'pure-cotton', name: 'Pure Cotton', color: '#21c700' },
  { slug: 'handloom', name: 'Handloom', color: '#8a5a2b' },
  { slug: 'bridal', name: 'Bridal', color: '#b3132d' },
  { slug: 'festive', name: 'Festive', color: '#d97706' },
  { slug: 'zari-work', name: 'Zari Work', color: '#b8860b' },
  { slug: 'hand-embroidered', name: 'Hand Embroidered', color: '#7c3aed' },
  { slug: 'daily-wear', name: 'Daily Wear', color: '#4d7c0f' },
  { slug: 'lightweight', name: 'Lightweight', color: '#0d9488' },
  { slug: 'bestseller', name: 'Bestseller', color: '#650f25' },
  { slug: 'new-arrival', name: 'New Arrival', color: '#2563eb' },
  { slug: 'gift-ready', name: 'Gift Ready', color: '#db2777' },
];

/** Which tags a demo saree gets, from its weave, fabric, name and status. */
function tagsFor(item: Item, isNew: boolean): string[] {
  const weave = WEAVES[item.category];
  const t = new Set<string>([weave.silk ? 'silk' : 'pure-cotton']);
  if (['handloom', 'jamdani', 'tant'].includes(item.category)) t.add('handloom');
  if (item.category === 'kantha-stitch') t.add('hand-embroidered');
  if (['swarnachori', 'baluchori'].includes(item.category) || /gold/i.test(item.name)) t.add('zari-work');
  if (/bridal|wedding/i.test(item.name)) t.add('bridal');
  else if (weave.silk) t.add('festive');
  if (!weave.silk) t.add('daily-wear');
  if (['tant', 'jamdani'].includes(item.category)) t.add('lightweight');
  if (['kantha-stitch', 'bishnupuri-silk'].includes(item.category)) t.add('gift-ready');
  if (FEATURED.has(item.name)) t.add('bestseller');
  if (isNew) t.add('new-arrival');
  return [...t];
}

/** Make sure every palette colour and tag exists; returns name → id and slug → id. */
async function ensureColorsAndTags(prisma: PrismaClient) {
  const colorId = new Map<string, string>();
  for (const [name, hexCode] of PALETTE) {
    const existing = await prisma.color.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    const id = existing?.id ?? (await prisma.color.create({ data: { name, hexCode }, select: { id: true } })).id;
    colorId.set(name, id);
  }
  const tagId = new Map<string, string>();
  for (const tag of TAGS) {
    const row = await prisma.tag.upsert({ where: { slug: tag.slug }, create: tag, update: {}, select: { id: true } });
    tagId.set(tag.slug, row.id);
  }
  return { colorId, tagId };
}

/* ───────────── Reviews ───────────── */
const NAMES = [
  'Priya Sen', 'Ananya Ghosh', 'Riya Das', 'Moumita Roy', 'Sneha Chatterjee', 'Debolina Basu', 'Ishita Mukherjee',
  'Payel Banerjee', 'Sayani Dutta', 'Tanushree Paul', 'Rupa Saha', 'Kavya Iyer', 'Neha Sharma', 'Pooja Verma',
  'Aditi Rao', 'Meera Nair', 'Shreya Kapoor', 'Nandini Pal', 'Sharmila Bose', 'Arpita Mondal', 'Swati Sinha',
  'Jaya Kundu', 'Madhuri Sarkar', 'Lopamudra Dey',
];
const REVIEWS: Record<'great' | 'good' | 'ok' | 'poor', { title: string; body: string }[]> = {
  great: [
    { title: 'Absolutely stunning', body: 'The colour is even richer in person and the weave is beautiful. Got so many compliments at the wedding.' },
    { title: 'Worth every rupee', body: 'Lovely drape and finish. Packaging was neat and it arrived well before the date I needed it.' },
    { title: 'Feels truly handwoven', body: 'You can see the craft in the small details. It feels special to wear something made by hand.' },
    { title: 'Gifted it to my mother', body: 'She loved it. Soft fabric, elegant pallu and exactly like the photos.' },
    { title: 'My new favourite saree', body: 'Light enough to wear for hours and the border is gorgeous. Will order again.' },
    { title: 'Beautiful quality', body: 'Fabric quality is excellent and the colours have not faded after the first dry clean.' },
  ],
  good: [
    { title: 'Very nice saree', body: 'Good quality and lovely colour. The blouse piece could have been a little longer.' },
    { title: 'Pretty and comfortable', body: 'Drapes well and is comfortable. Colour is slightly lighter than the photo but still nice.' },
    { title: 'Happy with the purchase', body: 'Nice weave and finish. Delivery took a couple of extra days but customer care kept me updated.' },
    { title: 'Good value', body: 'For the price this is a very good saree. Would recommend it for festive occasions.' },
  ],
  ok: [
    { title: 'Decent', body: 'The saree is fine but the colour is a bit different from what I expected from the pictures.' },
    { title: 'Average', body: 'Okay for occasional wear. The fabric is a little thinner than I hoped.' },
  ],
  poor: [
    { title: 'Not as expected', body: 'The shade did not match the photos for me. Support helped with an exchange though.' },
  ],
};
/** Mostly 4–5 stars, a few 3s, the odd 2/1. */
function rating(): number {
  const r = rand();
  return r < 0.52 ? 5 : r < 0.82 ? 4 : r < 0.94 ? 3 : r < 0.98 ? 2 : 1;
}
const reviewText = (stars: number) =>
  pick(stars === 5 ? REVIEWS.great : stars === 4 ? REVIEWS.good : stars === 3 ? REVIEWS.ok : REVIEWS.poor);

/* ───────────── Helpers ───────────── */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
/** ₹12,499 style prices: round to …99. */
const price99 = (rupees: number) => Math.max(99, Math.round(rupees / 100) * 100 - 1);
const paise = (rupees: number) => rupees * 100;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000 - int(0, 86_399) * 1000);

async function removeDemo(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.product.deleteMany({
    where: { variants: { some: { sku: { startsWith: SKU_PREFIX } } } },
  });
  return count;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
  });
  try {
    const removed = await removeDemo(prisma);
    if (removed) console.log(`Removed ${removed} existing demo products.`);
    if (process.argv.includes('--remove')) return;

    const categories = await prisma.category.findMany({
      where: { slug: { in: Object.keys(WEAVES) } },
      select: { id: true, slug: true },
    });
    const categoryId = new Map(categories.map((c) => [c.slug, c.id]));
    const missing = Object.keys(WEAVES).filter((s) => !categoryId.has(s));
    if (missing.length) throw new Error(`Missing categories: ${missing.join(', ')}`);
    const { colorId, tagId } = await ensureColorsAndTags(prisma);
    console.log(`Colours: ${colorId.size}. Tags: ${tagId.size}.`);

    const featured = FEATURED;
    const soldOut = SOLD_OUT;
    const created: { id: string; category: string }[] = [];

    for (const [i, item] of PRODUCTS.entries()) {
      seedFrom(item.name);
      const weave = WEAVES[item.category];
      const original = price99(int(weave.price[0], weave.price[1]));
      const onSale = rand() < 0.5;
      const sale = onSale ? price99(original * (1 - int(10, 25) / 100)) : null;
      const extraPhotos = shuffle(ALL_PHOTOS.filter((p) => p !== item.photo)).slice(0, int(2, 3));
      const photos = [item.photo, ...extraPhotos];
      const slug = slugify(item.name);

      const product = await prisma.product.create({
        data: {
          name: item.name,
          slug,
          shortDescription: `A ${weave.fabric.toLowerCase()} ${item.category.replace(/-/g, ' ')} saree, handpicked from weavers in Bengal.`,
          description:
            `${item.name} is woven by artisans in Bengal using ${weave.fabric.toLowerCase()}. ` +
            `It comes with a coordinated border and pallu, drapes gracefully and is finished by hand. ` +
            `Perfect for festive occasions, family functions and gifting.`,
          story: weave.story,
          categoryId: categoryId.get(item.category)!,
          fabric: weave.fabric,
          originalPrice: paise(original),
          discountPrice: sale ? paise(sale) : null,
          hsnCode: weave.hsn,
          gstRate: 5,
          lengthCm: 550,
          widthCm: weave.silk ? 115 : 110,
          blousePiece: weave.silk,
          blousePieceInfo: weave.silk ? '80 cm unstitched blouse piece' : null,
          washCare: weave.silk ? 'Dry clean only' : 'Gentle hand wash in cold water; dry in shade',
          countryOfOrigin: 'India',
          manufacturedBy: 'Shreeni Sarees Pvt. Ltd.',
          status: 'PUBLISHED',
          isFeatured: featured.has(item.name),
          sortOrder: i,
          // Second batch = "New Arrival": published in the last two weeks.
          publishedAt: daysAgo(i >= 20 ? int(1, 14) : int(15, 60)),
          images: {
            create: photos.map((p, n) => ({ url: PHOTOS[p], sortOrder: n, isPrimary: n === 0 })),
          },
          variants: {
            create: {
              size: 'Free Size',
              sku: `${SKU_PREFIX}${String(i + 1).padStart(3, '0')}-${slug.slice(0, 20).toUpperCase()}`,
              stock: soldOut.has(item.name) ? 0 : int(5, 20),
            },
          },
          specifications: {
            create: [
              { group: 'DETAILS', label: 'Fabric', value: weave.fabric, sortOrder: 0 },
              { group: 'DETAILS', label: 'Weave', value: item.category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), sortOrder: 1 },
              { group: 'DETAILS', label: 'Length', value: '5.5 m (with blouse piece where included)', sortOrder: 2 },
              { group: 'DETAILS', label: 'Occasion', value: weave.silk ? 'Wedding, festive' : 'Daily, festive', sortOrder: 3 },
              { group: 'MANUFACTURING', label: 'Origin', value: 'West Bengal, India', sortOrder: 0 },
            ],
          },
          colors: {
            create: (PRODUCT_COLORS[item.name] ?? [])
              .filter((name): name is string => !!name)
              .map((name, n) => ({ colorId: colorId.get(name)!, colorType: n === 0 ? ('PRIMARY' as const) : ('SECONDARY' as const) })),
          },
          tags: { create: tagsFor(item, i >= 20).map((slug) => ({ tagId: tagId.get(slug)! })) },
        },
        select: { id: true },
      });
      created.push({ id: product.id, category: item.category });

      // 10–15 approved reviews, spread over the last 6 months.
      const reviewers = shuffle(NAMES).slice(0, int(10, 15));
      await prisma.review.createMany({
        data: reviewers.map((name) => {
          const stars = rating();
          const text = reviewText(stars);
          const createdAt = daysAgo(int(1, 180));
          return {
            productId: product.id,
            rating: stars,
            title: text.title,
            body: text.body,
            reviewerName: `${name.split(' ')[0]} ${name.split(' ')[1][0]}.`,
            reviewerEmail: `${slugify(name).replace(/-/g, '.')}@example.com`,
            status: 'APPROVED' as const,
            createdAt,
            updatedAt: createdAt,
          };
        }),
      });
      process.stdout.write(`\rCreated ${created.length} / ${PRODUCTS.length} products`);
    }

    // 4 related products each: same category first, then others.
    seedFrom('related');
    const related = created.flatMap((p) => {
      const same = shuffle(created.filter((o) => o.id !== p.id && o.category === p.category));
      const others = shuffle(created.filter((o) => o.id !== p.id && o.category !== p.category));
      return [...same, ...others].slice(0, 4).map((r) => ({ productId: p.id, relatedProductId: r.id }));
    });
    await prisma.relatedProduct.createMany({ data: related, skipDuplicates: true });

    const reviews = await prisma.review.count({ where: { productId: { in: created.map((c) => c.id) } } });
    console.log(
      `\n✔ ${created.length} demo products, ${reviews} reviews, ${related.length} related links. ` +
        `Featured: ${[...featured].join(', ')}. Sold out: ${[...soldOut].join(', ')}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('✖ Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
