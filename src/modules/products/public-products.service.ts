import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { slugify } from '../../common/utils/catalog.js';
import {
  OFFER_LEVELS,
  PRICE_BUCKETS,
  filterConditions,
  inStockWhere,
  priceWhere,
  sortOrder,
  type FilterGroup,
} from './product-filters.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import type {
  ProductFacetsDto,
  PublicCrumbDto,
  PublicProductCardDto,
  PublicProductDetailDto,
  PublicProductPageDto,
  PublicProductFiltersDto,
  PublicProductQueryDto,
} from './dto/public-product.dto.js';

/** Highest quantity the storefront is told about; exact stock stays private. */
export const MAX_ORDERABLE = 10;

/** At or below this many pieces left (all sizes together), a card says "Only N left". */
export const FEW_LEFT_AT = 3;

/** Columns a product card needs. */
export const CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  originalPrice: true,
  discountPrice: true,
  // Main photo + the next one (shown on hover).
  images: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    take: 2,
    select: { url: true },
  },
  category: { select: { name: true } },
  // Only what's needed to tell whether any size can be bought.
  variants: { where: { isActive: true }, select: { stock: true, reservedStock: true } },
};

/** Default storefront order: featured, admin order, newest. */
const CARD_ORDER = [
  { isFeatured: 'desc' as const },
  { sortOrder: 'asc' as const },
  { publishedAt: 'desc' as const },
];

export type CardRow = {
  id: string;
  name: string;
  slug: string;
  originalPrice: number;
  discountPrice: number | null;
  images: { url: string }[];
  /** Optional so older callers/tests without it still work. */
  category?: { name: string } | null;
  variants: { stock: number; reservedStock: number }[];
};

/** Effective price + struck-through price, in paise. */
export function pricing(originalPrice: number, discountPrice: number | null) {
  const onSale = discountPrice !== null && discountPrice < originalPrice;
  return {
    price: onSale ? discountPrice : originalPrice,
    compareAtPrice: onSale ? originalPrice : null,
  };
}

export function toCard(p: CardRow): PublicProductCardDto {
  const left = p.variants.reduce((sum, v) => sum + Math.max(0, v.stock - v.reservedStock), 0);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    ...pricing(p.originalPrice, p.discountPrice),
    imageUrl: p.images[0]?.url ?? null,
    hoverImageUrl: p.images[1]?.url ?? null,
    categoryName: p.category?.name ?? null,
    // Same rule as the product page: some active size has stock left after reservations.
    inStock: left > 0,
    // Exact stock stays private: only small counts are shared, to say "Only 2 left".
    fewLeft: left > 0 && left <= FEW_LEFT_AT ? left : null,
  };
}

/** Read-only catalogue queries for the storefront. Published data only, display fields only. */
@Injectable()
export class PublicProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Published category + its published sub-categories, or 404. */
  private async categoryIds(slug: string): Promise<string[]> {
    const root = await this.prisma.category.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!root) throw new NotFoundException(`Category "${slug}" not found`);

    // Collect the published subtree (the category table is small).
    const published = await this.prisma.category.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, parentId: true },
    });
    const categoryIds = [root.id];
    for (let i = 0; i < categoryIds.length; i++) {
      for (const c of published) if (c.parentId === categoryIds[i]) categoryIds.push(c.id);
    }
    return categoryIds;
  }

  /** Colour slugs ("light-pink") → colour ids. The colour table is small. */
  private async colorIds(slugs: string[] | undefined): Promise<string[] | undefined> {
    if (!slugs?.length) return undefined;
    const colors = await this.prisma.color.findMany({ select: { id: true, name: true } });
    const wanted = new Set(slugs);
    return colors.filter((c) => wanted.has(slugify(c.name))).map((c) => c.id);
  }

  /** Products in a published category or any published sub-category, filtered and sorted, as cards. */
  async findCards(q: PublicProductQueryDto): Promise<PublicProductPageDto> {
    const [categoryIds, colorIds] = await Promise.all([this.categoryIds(q.category), this.colorIds(q.colors)]);
    const where: Prisma.ProductWhereInput = {
      AND: [
        { status: 'PUBLISHED', categoryId: { in: categoryIds } },
        ...filterConditions(q, colorIds, this.prisma.productVariant.fields.reservedStock),
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: sortOrder(q.sort),
        select: CARD_SELECT,
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginated(rows.map(toCard), total, q.page, q.limit);
  }

  /**
   * Filter options for a category with counts. Each group is counted with every OTHER selected
   * filter applied ("disjunctive" facets), so options never lead to an empty page.
   */
  async facets(f: PublicProductFiltersDto): Promise<ProductFacetsDto> {
    const [categoryIds, colorIds] = await Promise.all([this.categoryIds(f.category), this.colorIds(f.colors)]);
    const reserved = this.prisma.productVariant.fields.reservedStock;
    const base: Prisma.ProductWhereInput = { status: 'PUBLISHED', categoryId: { in: categoryIds } };
    const where = (except?: FilterGroup, extra?: Prisma.ProductWhereInput): Prisma.ProductWhereInput => ({
      AND: [base, ...filterConditions(f, colorIds, reserved, except), ...(extra ? [extra] : [])],
    });

    const [total, colorGroups, tagGroups, priceRange, inStockCount, ...counts] = await this.prisma.$transaction([
      this.prisma.product.count({ where: where() }),
      this.prisma.productColor.groupBy({
        by: ['colorId'],
        where: { colorType: 'PRIMARY', product: where('colors') },
        _count: { _all: true },
        orderBy: { colorId: 'asc' },
      }),
      this.prisma.productTag.groupBy({
        by: ['tagId'],
        where: { product: where('tags') },
        _count: { _all: true },
        orderBy: { tagId: 'asc' },
      }),
      this.prisma.product.aggregate({ where: where('price'), _min: { sellingPrice: true }, _max: { sellingPrice: true } }),
      this.prisma.product.count({ where: where('stock', inStockWhere(reserved)) }),
      ...PRICE_BUCKETS.map(([min, max]) => this.prisma.product.count({ where: where('price', priceWhere(min, max)) })),
      ...OFFER_LEVELS.map((pct) => this.prisma.product.count({ where: where('offer', { discountPercent: { gte: pct } }) })),
    ]);
    const bucketCounts = counts.slice(0, PRICE_BUCKETS.length);
    const offerCounts = counts.slice(PRICE_BUCKETS.length);

    const [colors, tags] = await Promise.all([
      this.prisma.color.findMany({
        where: { id: { in: colorGroups.map((g) => g.colorId) } },
        select: { id: true, name: true, hexCode: true },
      }),
      this.prisma.tag.findMany({
        where: { id: { in: tagGroups.map((g) => g.tagId) } },
        select: { id: true, name: true, slug: true, color: true },
      }),
    ]);
    const countOf = (groups: { _count: unknown }[], i: number) => (groups[i]._count as { _all: number })._all;
    const colorCount = new Map(colorGroups.map((g, i) => [g.colorId, countOf(colorGroups, i)]));
    const tagCount = new Map(tagGroups.map((g, i) => [g.tagId, countOf(tagGroups, i)]));

    return {
      total,
      colors: colors
        .map((c) => ({ slug: slugify(c.name), name: c.name, hexCode: c.hexCode, count: colorCount.get(c.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      tags: tags
        .map((t) => ({ slug: t.slug, name: t.name, color: t.color, count: tagCount.get(t.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      priceBuckets: PRICE_BUCKETS.map(([min, max], i) => ({ min, max, count: bucketCounts[i] })).filter((b) => b.count > 0),
      minPrice: priceRange._min.sellingPrice,
      maxPrice: priceRange._max.sellingPrice,
      offers: OFFER_LEVELS.map((minDiscount, i) => ({ minDiscount, count: offerCounts[i] })).filter((o) => o.count > 0),
      inStockCount,
    };
  }

  /** Everything the product page shows above the related section. */
  async findBySlug(slug: string): Promise<PublicProductDetailDto> {
    const p = await this.prisma.product.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        id: true,
        name: true,
        slug: true,
        shortDescription: true,
        description: true,
        story: true,
        originalPrice: true,
        discountPrice: true,
        fabric: true,
        lengthCm: true,
        widthCm: true,
        blousePiece: true,
        blousePieceInfo: true,
        washCare: true,
        countryOfOrigin: true,
        manufacturedBy: true,
        manufacturerAddress: true,
        categoryId: true,
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          select: { url: true },
        },
        variants: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, size: true, stock: true, reservedStock: true, priceOverride: true },
        },
        tags: {
          orderBy: { createdAt: 'asc' },
          select: { tag: { select: { name: true, slug: true, color: true } } },
        },
        colors: {
          orderBy: { colorType: 'asc' },
          select: { colorType: true, color: { select: { name: true, hexCode: true } } },
        },
        specifications: {
          orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
          select: { group: true, label: true, value: true },
        },
      },
    });
    if (!p) throw new NotFoundException(`Product "${slug}" not found`);

    const base = pricing(p.originalPrice, p.discountPrice);
    const spec = (group: 'DETAILS' | 'MANUFACTURING') =>
      p.specifications
        .filter((s) => s.group === group)
        .map((s) => ({ label: s.label, value: s.value }));

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      shortDescription: p.shortDescription,
      description: p.description,
      story: p.story,
      ...base,
      images: p.images,
      variants: p.variants.map((v) => ({
        id: v.id,
        size: v.size,
        // A size price override replaces the product price; the MRP stays the reference.
        ...(v.priceOverride === null
          ? base
          : pricing(p.originalPrice, v.priceOverride)),
        available: Math.min(MAX_ORDERABLE, Math.max(0, v.stock - v.reservedStock)),
      })),
      tags: p.tags.map((t) => t.tag),
      colors: p.colors.map((c) => ({
        type: c.colorType,
        name: c.color.name,
        hexCode: c.color.hexCode,
      })),
      facts: {
        fabric: p.fabric,
        lengthCm: p.lengthCm === null ? null : Number(p.lengthCm),
        widthCm: p.widthCm === null ? null : Number(p.widthCm),
        blousePiece: p.blousePiece,
        blousePieceInfo: p.blousePieceInfo,
        washCare: p.washCare,
      },
      specifications: { details: spec('DETAILS'), manufacturing: spec('MANUFACTURING') },
      maker: {
        countryOfOrigin: p.countryOfOrigin,
        manufacturedBy: p.manufacturedBy,
        manufacturerAddress: p.manufacturerAddress,
      },
      breadcrumb: await this.categoryPath(p.categoryId),
    };
  }

  /**
   * Related cards: the ones picked in the admin first (published only),
   * topped up with products from the same category.
   */
  async findRelated(slug: string, limit: number): Promise<PublicProductCardDto[]> {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        id: true,
        categoryId: true,
        relatedFrom: {
          where: { relatedProduct: { status: 'PUBLISHED' } },
          orderBy: { createdAt: 'asc' },
          take: limit,
          select: { relatedProduct: { select: CARD_SELECT } },
        },
      },
    });
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);

    const picked = product.relatedFrom.map((r) => r.relatedProduct);
    const missing = limit - picked.length;
    const fill =
      missing > 0
        ? await this.prisma.product.findMany({
            where: {
              status: 'PUBLISHED',
              categoryId: product.categoryId,
              id: { notIn: [product.id, ...picked.map((x) => x.id)] },
            },
            orderBy: CARD_ORDER,
            take: missing,
            select: CARD_SELECT,
          })
        : [];
    return [...picked, ...fill].map(toCard);
  }

  /** Category chain for the breadcrumb, top-most first; unpublished steps get slug null. */
  private async categoryPath(categoryId: string): Promise<PublicCrumbDto[]> {
    const path: PublicCrumbDto[] = [];
    let id: string | null = categoryId;
    for (let depth = 0; id && depth < 10; depth++) {
      const c: { name: string; slug: string; status: string; parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id },
          select: { name: true, slug: true, status: true, parentId: true },
        });
      if (!c) break;
      path.unshift({ name: c.name, slug: c.status === 'PUBLISHED' ? c.slug : null });
      id = c.parentId;
    }
    return path;
  }
}
