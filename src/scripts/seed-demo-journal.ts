/**
 * Demo Journal content for testing the storefront /journal pages: 2 categories, 1 author, 3 published posts
 * with Unsplash cover + inline photos, internal links (category, product, post, page) and external links.
 *
 *   npm run db:seed-journal              # create or refresh the demo posts (safe to re-run)
 *   npm run db:seed-journal -- --remove  # delete the demo posts, author and categories
 *
 * Saved through JournalService, so headings, reading time and the link index are computed like admin saves.
 * Photos are free Unsplash images (Unsplash License), hot-linked from images.unsplash.com.
 */
import 'dotenv/config';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../generated/prisma/client.js';
import {JournalService} from '../modules/journal/journal.service.js';
import type {PrismaService} from '../prisma/prisma.service.js';

const unsplash = (id: string, w = 1600) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;
const IMG = {
  redGold: unsplash('1769500804057-ca1391bf4617'),
  maroonGold: unsplash('1769500801406-d5abac0429c3'),
  wedding: unsplash('1570212773364-e30cd076539e'),
  lavender: unsplash('1610189026297-df356264479c'),
  whiteRed: unsplash('1678705730064-a7ecbab4b3fb'),
  group: unsplash('1610189026205-27510cfc52f8'),
};

const CATEGORIES = [
  {
    slug: 'weave-guides',
    name: 'Weave guides',
    description:
      'How Bengal’s great sarees are woven, and how to recognise the real thing.',
  },
  {
    slug: 'saree-care',
    name: 'Saree care',
    description: 'Keep silk, cotton and zari looking new for decades.',
  },
];
const AUTHOR = {
  slug: 'ananya-sen',
  name: 'Ananya Sen',
  role: 'Textile writer',
  bio: 'Ananya has spent a decade visiting weaving clusters across Bengal, writing about the craft and the families who keep it alive.',
  avatarUrl: unsplash('1494790108377-be9c29b29330', 400),
};
const POST_SLUGS = [
  'real-baluchori-vs-powerloom',
  'silk-saree-care-guide',
  'jamdani-woven-air-of-bengal',
];

/* ───────────── Tiptap document helpers ───────────── */
type Mark = {type: string; attrs?: Record<string, unknown>};
type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
  marks?: Mark[];
};
const t = (text: string, marks?: Mark[]): Node => ({
  type: 'text',
  text,
  ...(marks && {marks}),
});
const b = (text: string) => t(text, [{type: 'bold'}]);
const p = (...c: (Node | string)[]): Node => ({
  type: 'paragraph',
  content: c.map(x => (typeof x === 'string' ? t(x) : x)),
});
const h = (level: 2 | 3, text: string): Node => ({
  type: 'heading',
  attrs: {level},
  content: [t(text)],
});
const ul = (...items: (Node | string)[][]): Node => ({
  type: 'bulletList',
  content: items.map(i => ({type: 'listItem', content: [p(...i)]})),
});
const quote = (text: string): Node => ({
  type: 'blockquote',
  content: [p(text)],
});
const img = (src: string, alt: string, caption?: string): Node => ({
  type: 'image',
  attrs: {src, alt, title: caption ?? null, width: 1600, height: 1067},
});
const doc = (...content: Node[]) => ({type: 'doc', content});
/** Internal link (resolved to the live URL at read time). */
const inLink = (
  text: string,
  internalType: 'PRODUCT' | 'CATEGORY' | 'POST' | 'PAGE',
  internalId: string | null,
  href: string,
) =>
  t(text, [
    {
      type: 'link',
      attrs: {href, target: null, rel: null, internalType, internalId},
    },
  ]);
/** External link, new tab. */
const outLink = (text: string, href: string) =>
  t(text, [
    {
      type: 'link',
      attrs: {
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        internalType: null,
        internalId: null,
      },
    },
  ]);

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    }),
  });
  const journal = new JournalService(prisma as unknown as PrismaService);
  try {
    // Remove old demo posts first (re-runs start clean, and --remove stops here).
    const old = await prisma.journalPost.findMany({
      where: {slug: {in: POST_SLUGS}},
      select: {id: true},
    });
    for (const o of old) await journal.removePost(o.id);

    if (process.argv.includes('--remove')) {
      await prisma.journalAuthor.deleteMany({where: {slug: AUTHOR.slug}});
      await prisma.journalCategory.deleteMany({
        where: {slug: {in: CATEGORIES.map(c => c.slug)}},
      });
      console.log(
        `Removed ${old.length} demo post(s), the demo author and categories.`,
      );
      return;
    }

    const cats: Record<string, string> = {};
    for (const c of CATEGORIES) {
      const row = await prisma.journalCategory.upsert({
        where: {slug: c.slug},
        create: c,
        update: {name: c.name, description: c.description},
      });
      cats[c.slug] = row.id;
    }
    const author = await prisma.journalAuthor.upsert({
      where: {slug: AUTHOR.slug},
      create: AUTHOR,
      update: AUTHOR,
    });

    // Real shop items to link and feature (whatever is published right now).
    const category = (slug: string) =>
      prisma.category.findFirst({
        where: {slug, status: 'PUBLISHED'},
        select: {id: true, slug: true},
      });
    const productsIn = (slug: string, take: number) =>
      prisma.product.findMany({
        where: {status: 'PUBLISHED', category: {slug}},
        select: {id: true, slug: true, name: true},
        take,
        orderBy: {createdAt: 'asc'},
      });
    const [baluchori, jamdani] = await Promise.all([
      category('baluchori'),
      category('jamdani'),
    ]);
    const [baluchoriProducts, jamdaniProducts, anyProducts] = await Promise.all(
      [
        productsIn('baluchori', 4),
        productsIn('jamdani', 4),
        prisma.product.findMany({
          where: {status: 'PUBLISHED'},
          select: {id: true, slug: true, name: true},
          take: 4,
          orderBy: {createdAt: 'asc'},
        }),
      ],
    );
    const bProducts = baluchoriProducts.length
      ? baluchoriProducts
      : anyProducts;
    const jProducts = jamdaniProducts.length ? jamdaniProducts : anyProducts;
    const catLink = (
      text: string,
      c: {id: string; slug: string} | null,
      fallback: string,
    ) =>
      c
        ? inLink(text, 'CATEGORY', c.id, `/sarees/${c.slug}`)
        : inLink(text, 'PAGE', null, fallback);
    const productLink = (text: string, pr?: {id: string; slug: string}) =>
      pr ? inLink(text, 'PRODUCT', pr.id, `/products/${pr.slug}`) : t(text);

    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();

    /* ── 1. Weave guide (featured) ── */
    const post1 = await journal.createPost({
      slug: POST_SLUGS[0],
      title: 'How to tell a real Baluchori from a power-loom copy',
      excerpt:
        'Five things to check, from the back of the pallu to the price tag, before you buy a Baluchori silk saree.',
      coverImageUrl: IMG.redGold,
      coverAlt: 'A red and gold Baluchori silk saree with a woven pallu',
      status: 'PUBLISHED',
      publishedAt: new Date(now - 9 * day).toISOString(),
      isFeatured: true,
      seoTitle: 'Real Baluchori vs Power-loom: 5 Checks Before You Buy',
      seoDescription:
        'Learn to spot a genuine handwoven Baluchori silk saree: the pallu story, the reverse side, the weight, the GI tag and a fair price.',
      focusKeyword: 'real baluchori saree',
      categoryId: cats['weave-guides'],
      authorId: author.id,
      tags: ['Baluchori', 'Silk', 'Buying guide'],
      productIds: bProducts.map(x => x.id),
      content: doc(
        p(
          'A ',
          catLink('Baluchori saree', baluchori, '/sarees'),
          ' tells a story in silk: scenes from the Mahabharata, courtly life or temple panels woven into the pallu, thread by thread. That story is exactly what power-loom copies try to fake. Here is how to tell the difference.',
        ),
        h(2, '1. Read the pallu like a picture book'),
        p(
          'On a handwoven Baluchori the pallu is made of small, framed panels, each with figures that have faces, hands and clothing details. Copies simplify the figures into flat silhouettes and repeat a single motif.',
        ),
        img(
          IMG.maroonGold,
          'Close-up of a maroon and gold woven pallu with figure motifs',
          'Framed figure panels on a handwoven pallu.',
        ),
        h(2, '2. Turn it over'),
        p(
          'Look at the reverse. A handloom shows floating threads and tiny irregularities where the weaver changed colours by hand. A power-loom back is perfectly uniform, often with a printed or glued look.',
        ),
        h(2, '3. Feel the weight and the fall'),
        p(
          'Pure mulberry silk Baluchori is light yet dense, and drapes softly. Very stiff or very slippery fabric usually means synthetic yarn or a polyester blend.',
        ),
        h(2, '4. Ask about the GI tag'),
        p(
          'Baluchori has a ',
          outLink(
            'Geographical Indication (GI) tag',
            'https://en.wikipedia.org/wiki/Baluchari_Sari',
          ),
          ', tied to weavers in Bishnupur, West Bengal. Ask the seller where and by whom it was woven.',
        ),
        h(2, '5. Be wary of a too-good price'),
        p(
          'A Baluchori takes a weaver one to three weeks. If a "pure silk" one costs less than a good dinner for four, it is not handwoven.',
        ),
        quote('Every Baluchori pallu is a page of a book. Read it slowly.'),
        h(3, 'Our pick to start with'),
        p(
          'If you are buying your first, ',
          productLink(
            bProducts[0] ? bProducts[0].name : 'this saree',
            bProducts[0],
          ),
          ' is a classic red-and-gold piece with a full figure pallu.',
        ),
      ),
    });

    /* ── 2. Care guide (links to post 1) ── */
    await journal.createPost({
      slug: POST_SLUGS[1],
      title: 'Caring for silk sarees: storage, washing and the muslin rule',
      excerpt:
        'Simple habits that keep silk and zari bright for decades — and the three mistakes that ruin them fastest.',
      coverImageUrl: IMG.lavender,
      coverAlt: 'Folded silk sarees in soft colours stacked on a shelf',
      status: 'PUBLISHED',
      publishedAt: new Date(now - 5 * day).toISOString(),
      seoTitle: 'Silk Saree Care: How to Store, Wash & Protect Zari',
      seoDescription:
        'How to store and clean silk sarees at home: muslin wrapping, refolding, dry cleaning, removing stains and keeping zari from tarnishing.',
      focusKeyword: 'silk saree care',
      categoryId: cats['saree-care'],
      authorId: author.id,
      tags: ['Silk', 'Care'],
      productIds: anyProducts.slice(0, 3).map(x => x.id),
      content: doc(
        p(
          'A good silk saree can outlive the person who bought it — if it is stored well. Most damage happens in the cupboard, not at the party.',
        ),
        h(2, 'Storage'),
        ul(
          [
            b('Wrap it in muslin'),
            ' or soft cotton, never plastic. Silk needs to breathe.',
          ],
          [
            b('Refold every three months'),
            ' along different lines, so the creases never set and crack.',
          ],
          [
            b('Keep zari away from metal'),
            ' hangers and naphthalene; both tarnish the gold thread.',
          ],
        ),
        img(
          IMG.whiteRed,
          'A white and red saree folded neatly on a wooden surface',
          'Muslin-wrapped and refolded: the two habits that matter most.',
        ),
        h(2, 'Washing'),
        p(
          'Dry clean the first few times. After that, a gentle hand wash in cold water with a mild shampoo is fine for most silks. Never wring, and dry in the shade.',
        ),
        h(3, 'Stains'),
        p(
          'Blot, never rub. For oil, sprinkle talc and leave it overnight before brushing off.',
        ),
        h(2, 'Know what you own'),
        p(
          'Handwoven silks need gentler care than power-loom ones. Not sure which you have? Our guide on ',
          inLink(
            'telling a real Baluchori from a copy',
            'POST',
            post1.id ?? null,
            `/journal/${post1.slug}`,
          ),
          ' covers what to look for. For deeper reading, see the ',
          outLink('Central Silk Board', 'https://csb.gov.in/'),
          ' notes on silk types.',
        ),
      ),
    });

    /* ── 3. Jamdani story (links to category, page, post 1) ── */
    await journal.createPost({
      slug: POST_SLUGS[2],
      title: 'Jamdani: the woven air of Bengal',
      excerpt:
        'How weavers float patterns into fabric so fine it was once called "woven air" — and why each Jamdani is one of a kind.',
      coverImageUrl: IMG.wedding,
      coverAlt: 'A woman in a light Jamdani saree standing in soft daylight',
      status: 'PUBLISHED',
      publishedAt: new Date(now - 2 * day).toISOString(),
      seoTitle: 'Jamdani Saree: History, Weaving & How to Choose One',
      seoDescription:
        'The story of Jamdani, the “woven air” of Bengal: how its floating motifs are made by hand, its UNESCO recognition and how to pick one.',
      focusKeyword: 'jamdani saree',
      categoryId: cats['weave-guides'],
      authorId: author.id,
      tags: ['Jamdani', 'Cotton', 'Heritage'],
      productIds: jProducts.map(x => x.id),
      content: doc(
        p(
          'Jamdani is a supplementary-weft technique: the weaver lays extra threads by hand, one motif at a time, while the base fabric is woven. No drawing, no card — the pattern lives in the weaver’s memory. Browse our ',
          catLink('Jamdani sarees', jamdani, '/sarees'),
          ' and you will see no two are quite the same.',
        ),
        h(2, 'A craft recognised by UNESCO'),
        p(
          'The traditional art of Jamdani weaving is on the ',
          outLink(
            'UNESCO list of Intangible Cultural Heritage',
            'https://ich.unesco.org/en/RL/traditional-art-of-jamdani-weaving-00879',
          ),
          '. In Bengal it is woven in Nadia and Burdwan, often by families who have done so for generations.',
        ),
        img(
          IMG.group,
          'Several handloom sarees in bright colours displayed together',
          'Each motif is inserted by hand as the cloth is woven.',
        ),
        h(2, 'How to choose one'),
        ul(
          [
            b('Count threads, not colours.'),
            ' A finer count (100s and above) feels lighter and drapes better.',
          ],
          [
            b('Check the motif edges.'),
            ' Handwoven motifs have tiny loose ends on the back.',
          ],
          [
            b('Start with a classic'),
            ' white or off-white base; it suits every occasion.',
          ],
        ),
        p(
          'Want to know more about the people behind the looms? Read about our ',
          inLink('craftsmanship', 'PAGE', null, '/about/craftsmanship'),
          ', or learn how a Baluchori differs in our ',
          inLink(
            'Baluchori buying guide',
            'POST',
            post1.id ?? null,
            `/journal/${post1.slug}`,
          ),
          '.',
        ),
      ),
    });

    // Demo posts were "written" on their publish date, so don't show an "Updated today" line.
    await prisma.$executeRaw`UPDATE "JournalPost" SET "updatedAt" = "publishedAt" WHERE slug = ANY(${POST_SLUGS})`;

    console.log(
      `Seeded 3 demo posts (${POST_SLUGS.join(', ')}), 2 categories and 1 author.`,
    );
    console.log(
      `Linked products: ${bProducts.length} Baluchori, ${jProducts.length} Jamdani.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
