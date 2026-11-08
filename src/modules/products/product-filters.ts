import type { Prisma } from '../../generated/prisma/client.js';
import type { ProductSort, PublicProductFiltersDto } from './dto/public-product.dto.js';

/*
 * Storefront product filters, defined once and used by both the product list and the facet counts,
 * so the counts always agree with what the list returns.
 */

export type FilterGroup = 'price' | 'colors' | 'tags' | 'offer' | 'stock';

/** Price quick-picks shown in the filter panel (paise; null = open-ended). */
export const PRICE_BUCKETS: [min: number | null, max: number | null][] = [
  [null, 200_000],
  [200_000, 500_000],
  [500_000, 1_000_000],
  [1_000_000, null],
];

/** "X% off or more" options. */
export const OFFER_LEVELS = [10, 20, 30, 40, 50];

export function priceWhere(min: number | null | undefined, max: number | null | undefined): Prisma.ProductWhereInput {
  return {
    sellingPrice: {
      ...(min != null && { gte: min }),
      ...(max != null && { lte: max }),
    },
  };
}

/** A size that can be bought now: active, with stock left after reservations. */
export const inStockWhere = (reservedStock: Prisma.FieldRef<'ProductVariant', 'Int'>): Prisma.ProductWhereInput => ({
  variants: { some: { isActive: true, stock: { gt: reservedStock } } },
});

/**
 * Conditions for every selected filter, except `except` (used for that group's own facet counts).
 * Within a group the options are OR ("red or teal"); across groups they are AND.
 * `colorIds`: the selected colour slugs resolved to ids (unknown slugs simply match nothing).
 */
export function filterConditions(
  f: PublicProductFiltersDto,
  colorIds: string[] | undefined,
  reservedStock: Prisma.FieldRef<'ProductVariant', 'Int'>,
  except?: FilterGroup,
): Prisma.ProductWhereInput[] {
  const out: Prisma.ProductWhereInput[] = [];
  if (except !== 'price' && (f.minPrice != null || f.maxPrice != null)) out.push(priceWhere(f.minPrice, f.maxPrice));
  if (except !== 'colors' && f.colors?.length) {
    out.push({ colors: { some: { colorType: 'PRIMARY', colorId: { in: colorIds ?? [] } } } });
  }
  if (except !== 'tags' && f.tags?.length) out.push({ tags: { some: { tag: { slug: { in: f.tags } } } } });
  if (except !== 'offer' && f.minDiscount) out.push({ discountPercent: { gte: f.minDiscount } });
  if (except !== 'stock' && f.inStock) out.push(inStockWhere(reservedStock));
  return out;
}

/** Sort orders; `id` last so pages never shuffle between requests. */
export function sortOrder(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ publishedAt: 'desc' }, { id: 'asc' }];
    case 'price-asc':
      return [{ sellingPrice: 'asc' }, { id: 'asc' }];
    case 'price-desc':
      return [{ sellingPrice: 'desc' }, { id: 'asc' }];
    case 'discount':
      return [{ discountPercent: 'desc' }, { sellingPrice: 'asc' }, { id: 'asc' }];
    default:
      // Featured: featured first, then the admin's order, newest.
      return [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }];
  }
}
