import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { paginated } from '../../common/utils/pagination.js';
import type { PublicProductCardDto, PublicProductPageDto } from './dto/public-product.dto.js';
import type { SearchQueryDto, SearchSort, SearchSuggestionsDto } from './dto/search.dto.js';
import { CARD_SELECT, toCard } from './public-products.service.js';

/*
 * Storefront search on PostgreSQL + pg_trgm (trigram GIN index on product names).
 * Every word must match the product's name, category, fabric, a tag or its main colour;
 * names and categories also match with small typos ("baluchri" → Baluchori).
 * Fine for catalogues up to tens of thousands of products; beyond that, a dedicated engine
 * (Meilisearch/Typesense/Algolia) is the usual next step — the API shape can stay the same.
 */

/** word_similarity cut-off for typo matches (measured: typos score ≥0.57, unrelated words ≤0.43). */
const FUZZY = 0.5;
/** Very short words don't have enough trigrams to compare reliably: plain "contains" only. */
const MIN_FUZZY_LEN = 3;
const MAX_TOKENS = 6;
const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'for', 'with', 'of', 'in', 'on', 'to']);

/** "  Red  SILK sarees!! " → ["red", "silk", "sarees"] */
export function tokenize(q: string): string[] {
  const words = q
    .toLowerCase()
    .normalize('NFKC')
    // Keep letters, combining marks (Bengali/Hindi vowel signs) and digits; everything else is a separator.
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, MAX_TOKENS);
}

/** Escape LIKE wildcards in user input. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function tokenMatch(t: string): Prisma.Sql {
  const like = `%${likeEscape(t)}%`;
  const fuzzy =
    t.length >= MIN_FUZZY_LEN
      ? Prisma.sql`OR word_similarity(${t}::text, lower(p."name")) >= ${FUZZY} OR word_similarity(${t}::text, lower(c."name")) >= ${FUZZY}`
      : Prisma.empty;
  return Prisma.sql`(
    lower(p."name") LIKE ${like}
    OR lower(c."name") LIKE ${like}
    OR lower(coalesce(p."fabric", '')) LIKE ${like}
    OR EXISTS (SELECT 1 FROM "ProductTag" pt JOIN "Tag" tg ON tg."id" = pt."tagId"
               WHERE pt."productId" = p."id" AND lower(tg."name") LIKE ${like})
    OR EXISTS (SELECT 1 FROM "ProductColor" pc JOIN "Color" co ON co."id" = pc."colorId"
               WHERE pc."productId" = p."id" AND pc."colorType" = 'PRIMARY' AND lower(co."name") LIKE ${like})
    ${fuzzy}
  )`;
}

/** Per-word score: best of name (strongest), category, fabric; tag/colour-only matches get a floor. */
function tokenScore(t: string): Prisma.Sql {
  const like = `%${likeEscape(t)}%`;
  return Prisma.sql`GREATEST(
    word_similarity(${t}::text, lower(p."name")),
    0.8 * word_similarity(${t}::text, lower(c."name")),
    CASE WHEN lower(coalesce(p."fabric", '')) LIKE ${like} THEN 0.6 ELSE 0 END,
    0.4
  )`;
}

const ORDER: Record<SearchSort, Prisma.Sql> = {
  relevance: Prisma.sql`score DESC, p."isFeatured" DESC, p."sortOrder" ASC, p."id" ASC`,
  newest: Prisma.sql`p."publishedAt" DESC NULLS LAST, score DESC, p."id" ASC`,
  'price-asc': Prisma.sql`p."sellingPrice" ASC, score DESC, p."id" ASC`,
  'price-desc': Prisma.sql`p."sellingPrice" DESC, score DESC, p."id" ASC`,
  discount: Prisma.sql`p."discountPercent" DESC, score DESC, p."id" ASC`,
};

@Injectable()
export class ProductSearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ids (in result order) and the total number of matches. */
  private async matchIds(q: string, sort: SearchSort, limit: number, offset: number) {
    const tokens = tokenize(q);
    if (tokens.length === 0) return { ids: [] as string[], total: 0 };
    const phrase = tokens.join(' ');
    const phraseLike = `%${likeEscape(phrase)}%`;
    const prefixLike = `${likeEscape(phrase)}%`;

    const rows = await this.prisma.$queryRaw<{ id: string; total: bigint }[]>`
      SELECT p."id",
             (${Prisma.join(tokens.map(tokenScore), ' + ')})
               + CASE WHEN lower(p."name") LIKE ${phraseLike} THEN 1 ELSE 0 END
               + CASE WHEN lower(p."name") LIKE ${prefixLike} THEN 0.5 ELSE 0 END AS score,
             COUNT(*) OVER () AS total
      FROM "Product" p
      JOIN "Category" c ON c."id" = p."categoryId"
      WHERE p."status" = 'PUBLISHED'
        AND ${Prisma.join(tokens.map(tokenMatch), ' AND ')}
      ORDER BY ${ORDER[sort]}
      LIMIT ${limit} OFFSET ${offset}
    `;
    return { ids: rows.map((r) => r.id), total: rows.length ? Number(rows[0].total) : 0 };
  }

  /** Cards for ids, kept in the given order. */
  private async cards(ids: string[]): Promise<PublicProductCardDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, select: CARD_SELECT });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => (byId.has(id) ? [toCard(byId.get(id)!)] : []));
  }

  async search(q: SearchQueryDto): Promise<PublicProductPageDto> {
    const { ids, total } = await this.matchIds(q.q, q.sort, q.limit, (q.page - 1) * q.limit);
    // Past the last page: COUNT(*) OVER () has no row to report on, so count separately.
    const count = ids.length === 0 && q.page > 1 ? (await this.matchIds(q.q, q.sort, 1, 0)).total : total;
    return paginated(await this.cards(ids), count, q.page, q.limit);
  }

  /** Search-as-you-type: up to 4 matching categories and 6 products. */
  async suggest(q: string): Promise<SearchSuggestionsDto> {
    const tokens = tokenize(q);
    if (tokens.length === 0) return { categories: [], products: [], total: 0 };
    const phrase = tokens.join(' ');
    const like = `%${likeEscape(phrase)}%`;
    const fuzzy = phrase.length >= MIN_FUZZY_LEN ? Prisma.sql`OR word_similarity(${phrase}::text, lower("name")) >= ${FUZZY}` : Prisma.empty;

    const [{ ids, total }, categories] = await Promise.all([
      this.matchIds(q, 'relevance', 6, 0),
      this.prisma.$queryRaw<{ slug: string; name: string }[]>`
        SELECT "slug", "name" FROM "Category"
        WHERE "status" = 'PUBLISHED' AND "parentId" IS NOT NULL
          AND (lower("name") LIKE ${like} ${fuzzy})
        ORDER BY word_similarity(${phrase}::text, lower("name")) DESC, "sortOrder" ASC
        LIMIT 4
      `,
    ]);
    return { categories, products: await this.cards(ids), total };
  }
}
