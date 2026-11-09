import { describe, expect, it } from 'vitest';
import { toCard, type CardRow } from './public-products.service.js';

const base: CardRow = {
  id: 'p1',
  name: 'Red Kantha Saree',
  slug: 'red-kantha-saree',
  originalPrice: 450000,
  discountPrice: 349900,
  images: [{ url: 'https://img/1.webp' }, { url: 'https://img/2.webp' }],
  category: { name: 'Kantha Stitch' },
  variants: [{ stock: 10, reservedStock: 0 }],
};

describe('toCard', () => {
  it('adds the hover photo and category name', () => {
    const card = toCard(base);
    expect(card.imageUrl).toBe('https://img/1.webp');
    expect(card.hoverImageUrl).toBe('https://img/2.webp');
    expect(card.categoryName).toBe('Kantha Stitch');
    expect(card).toMatchObject({ price: 349900, compareAtPrice: 450000 });
  });

  it('has no hover photo when there is only one', () => {
    expect(toCard({ ...base, images: [{ url: 'https://img/1.webp' }] }).hoverImageUrl).toBeNull();
  });

  it('shares small stock counts only, summed over sizes after reservations', () => {
    expect(toCard(base).fewLeft).toBeNull(); // 10 left: private
    const few = toCard({
      ...base,
      variants: [
        { stock: 2, reservedStock: 1 },
        { stock: 1, reservedStock: 0 },
        { stock: 0, reservedStock: 2 }, // over-reserved: counts as 0, not −2
      ],
    });
    expect(few).toMatchObject({ fewLeft: 2, inStock: true });
  });

  it('is sold out with no "few left" when nothing remains', () => {
    expect(toCard({ ...base, variants: [{ stock: 1, reservedStock: 1 }] })).toMatchObject({
      inStock: false,
      fewLeft: null,
    });
  });
});
