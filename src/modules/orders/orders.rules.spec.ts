import { generateOrderNumber, normalizeOrderNumber } from './order-number.js';
import { couponDiscount, couponProblem, totals, type CouponRow } from './order-pricing.js';
import { CUSTOMER_CANCELLABLE, canMove, stockEffect } from './order-status.js';

describe('order number', () => {
  it('is OD + India date (YYMMDD) + 6 digits', () => {
    // 8 Nov 2026, 20:00 UTC = 9 Nov 01:30 in India → date part follows India.
    const n = generateOrderNumber(new Date('2026-11-08T20:00:00Z'));
    expect(n).toMatch(/^OD261109\d{6}$/);
  });

  it('varies within the same second', () => {
    const at = new Date('2026-11-08T10:00:00Z');
    const numbers = new Set(Array.from({ length: 50 }, () => generateOrderNumber(at)));
    expect(numbers.size).toBeGreaterThan(45);
  });

  it('normalizes what shoppers type', () => {
    expect(normalizeOrderNumber(' od261108482913 ')).toBe('OD261108482913');
    expect(normalizeOrderNumber('OD 2611 0848 2913')).toBe('OD261108482913');
    expect(normalizeOrderNumber('OD12345')).toBeNull();
    expect(normalizeOrderNumber('SHR-10234')).toBeNull();
  });
});

describe('coupons', () => {
  const now = new Date('2026-11-08T10:00:00Z');
  const base: CouponRow = {
    id: 'c1',
    code: 'DIWALI20',
    description: null,
    type: 'PERCENTAGE',
    value: 20,
    maxDiscountAmount: null,
    minOrderValue: null,
    usageLimit: null,
    usedCount: 0,
    perUserLimit: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
  };

  it('percent off, with its cap', () => {
    expect(couponDiscount(base, 1_000_000)).toBe(200_000);
    expect(couponDiscount({ ...base, maxDiscountAmount: 50_000 }, 1_000_000)).toBe(50_000);
  });

  it('flat off never exceeds the subtotal', () => {
    expect(couponDiscount({ ...base, type: 'FLAT', value: 30_000 }, 1_000_000)).toBe(30_000);
    expect(couponDiscount({ ...base, type: 'FLAT', value: 30_000 }, 20_000)).toBe(20_000);
  });

  it('explains why a coupon cannot be used', () => {
    expect(couponProblem(null, 100, now)).toMatch(/isn't valid/);
    expect(couponProblem({ ...base, isActive: false }, 100, now)).toMatch(/isn't valid/);
    expect(couponProblem({ ...base, startsAt: new Date('2026-12-01') }, 100, now)).toMatch(/isn't active yet/);
    expect(couponProblem({ ...base, endsAt: new Date('2026-11-01') }, 100, now)).toMatch(/expired/);
    expect(couponProblem({ ...base, usageLimit: 5, usedCount: 5 }, 100, now)).toMatch(/fully used/);
    expect(couponProblem({ ...base, perUserLimit: 1 }, 100, now, 1)).toMatch(/already used/);
    expect(couponProblem({ ...base, minOrderValue: 199_900 }, 150_000, now)).toBe(
      'Add ₹499 more to use this coupon (minimum order ₹1,999)',
    );
    expect(couponProblem(base, 100, now)).toBeNull();
  });

  it('totals: subtotal − discount + shipping (free for now)', () => {
    expect(totals(1_000_000, 200_000)).toEqual({
      subtotal: 1_000_000,
      discountTotal: 200_000,
      shippingTotal: 0,
      taxTotal: 0,
      grandTotal: 800_000,
    });
  });
});

describe('order status rules', () => {
  it('only allows the life-cycle moves', () => {
    expect(canMove('PENDING', 'CONFIRMED')).toBe(true);
    expect(canMove('CONFIRMED', 'PACKED')).toBe(true);
    expect(canMove('PACKED', 'SHIPPED')).toBe(true);
    expect(canMove('SHIPPED', 'DELIVERED')).toBe(true);
    expect(canMove('DELIVERED', 'RETURNED')).toBe(true);
    expect(canMove('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canMove('CONFIRMED', 'DELIVERED')).toBe(false);
    expect(canMove('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('customers can cancel only before packing', () => {
    expect(CUSTOMER_CANCELLABLE).toEqual(['PENDING', 'CONFIRMED']);
  });

  it('stock: unpaid cancel releases the reservation, later cancels/returns restock', () => {
    expect(stockEffect('PENDING', 'CANCELLED')).toBe('release');
    expect(stockEffect('CONFIRMED', 'CANCELLED')).toBe('restock');
    expect(stockEffect('PACKED', 'CANCELLED')).toBe('restock');
    expect(stockEffect('DELIVERED', 'RETURNED')).toBe('restock');
    expect(stockEffect('CONFIRMED', 'PACKED')).toBeNull();
  });
});
