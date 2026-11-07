import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import type {
  PublicCrumbDto,
  PublicProductCardDto,
  PublicProductDetailDto,
  PublicProductPageDto,
  PublicProductQueryDto,
} from './dto/public-product.dto.js';

/** Highest quantity the storefront is told about; exact stock stays private. */
export const MAX_ORDERABLE = 10;

/** Columns a product card needs. */
export const CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  originalPrice: true,
  discountPrice: true,
  images: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    take: 1,
    select: { url: true },
  },
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
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    ...pricing(p.originalPrice, p.discountPrice),
    imageUrl: p.images[0]?.url ?? null,
  };
}

/** Read-only catalogue queries for the storefront. Published data only, display fields only. */
@Injectable()
export class PublicProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Products in a published category or any published sub-category, as cards. */
  async findCards(q: PublicProductQueryDto): Promise<PublicProductPageDto> {
    const root = await this.prisma.category.findFirst({
      where: { slug: q.category, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!root) throw new NotFoundException(`Category "${q.category}" not found`);

    // Collect the published subtree (the category table is small).
    const published = await this.prisma.category.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, parentId: true },
    });
    const categoryIds = [root.id];
    for (let i = 0; i < categoryIds.length; i++) {
      for (const c of published) if (c.parentId === categoryIds[i]) categoryIds.push(c.id);
    }

    const where = { status: 'PUBLISHED' as const, categoryId: { in: categoryIds } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: CARD_ORDER,
        select: CARD_SELECT,
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginated(rows.map(toCard), total, q.page, q.limit);
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
