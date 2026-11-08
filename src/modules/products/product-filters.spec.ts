import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicProductFiltersDto } from './dto/public-product.dto.js';
import { derivedPrices } from './derived-prices.js';
import { filterConditions, priceWhere, sortOrder } from './product-filters.js';

const REF = { name: 'reservedStock' } as unknown as Prisma.FieldRef<'ProductVariant', 'Int'>;
const f = (extra: Partial<PublicProductFiltersDto> = {}): PublicProductFiltersDto => ({ category: 'handloom', ...extra });

describe('derivedPrices', () => {
  it('uses the sale price only when it is lower', () => {
    expect(derivedPrices(500000, 400000)).toEqual({ sellingPrice: 400000, discountPercent: 20 });
    expect(derivedPrices(500000, null)).toEqual({ sellingPrice: 500000, discountPercent: 0 });
    expect(derivedPrices(500000, 600000)).toEqual({ sellingPrice: 500000, discountPercent: 0 });
  });

  it('rounds the discount to a whole percent', () => {
    expect(derivedPrices(299900, 249900).discountPercent).toBe(17);
  });
});

describe('filterConditions', () => {
  it('adds nothing when no filter is selected', () => {
    expect(filterConditions(f(), undefined, REF)).toEqual([]);
  });

  it('builds one condition per selected group (AND across groups)', () => {
    const conds = filterConditions(
      f({ minPrice: 100000, maxPrice: 300000, colors: ['red'], tags: ['bridal', 'festive'], minDiscount: 20, inStock: true }),
      ['color-red-id'],
      REF,
    );
    expect(conds).toEqual([
      { sellingPrice: { gte: 100000, lte: 300000 } },
      { colors: { some: { colorType: 'PRIMARY', colorId: { in: ['color-red-id'] } } } },
      { tags: { some: { tag: { slug: { in: ['bridal', 'festive'] } } } } },
      { discountPercent: { gte: 20 } },
      { variants: { some: { isActive: true, stock: { gt: REF } } } },
    ]);
  });

  it('leaves out one group for that group’s own facet counts', () => {
    const conds = filterConditions(f({ colors: ['red'], minDiscount: 20 }), ['id'], REF, 'colors');
    expect(conds).toEqual([{ discountPercent: { gte: 20 } }]);
  });

  it('matches nothing for colour slugs that do not exist', () => {
    const [cond] = filterConditions(f({ colors: ['no-such-colour'] }), [], REF);
    expect(cond).toEqual({ colors: { some: { colorType: 'PRIMARY', colorId: { in: [] } } } });
  });

  it('supports open-ended price ranges', () => {
    expect(priceWhere(null, 200000)).toEqual({ sellingPrice: { lte: 200000 } });
    expect(priceWhere(1000000, null)).toEqual({ sellingPrice: { gte: 1000000 } });
  });
});

describe('sortOrder', () => {
  it.each([
    ['price-asc', { sellingPrice: 'asc' }],
    ['price-desc', { sellingPrice: 'desc' }],
    ['discount', { discountPercent: 'desc' }],
    ['newest', { publishedAt: 'desc' }],
    ['featured', { isFeatured: 'desc' }],
  ] as const)('%s sorts by %o first and always ends with id (stable pages)', (sort, first) => {
    const order = sortOrder(sort);
    expect(order[0]).toEqual(first);
    expect(order.at(-1)).toEqual({ id: 'asc' });
  });
});
