import { describe, expect, it } from 'vitest';
import { hiddenReason, type VisibilityInput } from './home-pick-visibility.js';

const now = new Date('2026-11-10T12:00:00Z');
const live: VisibilityInput = {
  isActive: true,
  startsAt: null,
  endsAt: null,
  productStatus: 'PUBLISHED',
  categoryStatus: 'PUBLISHED',
  inStock: true,
};

describe('hiddenReason', () => {
  it('is null for a live pick', () => {
    expect(hiddenReason(live, now)).toBeNull();
  });

  it('is live inside its window, including the exact start moment', () => {
    expect(hiddenReason({ ...live, startsAt: now, endsAt: new Date('2026-11-11T00:00:00Z') }, now)).toBeNull();
  });

  it.each<[string, Partial<VisibilityInput>]>([
    ['switched-off', { isActive: false }],
    ['scheduled', { startsAt: new Date('2026-11-10T12:00:01Z') }],
    ['ended', { endsAt: now }],
    ['product-unpublished', { productStatus: 'DRAFT' }],
    ['category-unpublished', { categoryStatus: 'UNPUBLISHED' }],
    ['out-of-stock', { inStock: false }],
  ])('reports %s', (reason, change) => {
    expect(hiddenReason({ ...live, ...change }, now)).toBe(reason);
  });

  it('reports the first problem an admin would fix', () => {
    expect(hiddenReason({ ...live, isActive: false, inStock: false, productStatus: 'DRAFT' }, now)).toBe(
      'switched-off',
    );
  });
});
