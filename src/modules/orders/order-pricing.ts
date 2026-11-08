import type { DiscountType } from '../../generated/prisma/enums.js';

/*
 * Order totals and coupon rules — plain functions (no database), so they're easy to test
 * and the checkout quote and the placed order always use the same maths.
 * All amounts are paise. Prices already include GST, so no tax is added on top.
 */

/** Delivery fee rule. Free on every order for now: set FLAT_SHIPPING_FEE (and a threshold) to charge. */
export const FREE_SHIPPING_FROM = 0;
export const FLAT_SHIPPING_FEE = 0;

export function shippingFor(subtotalAfterDiscount: number): number {
  return subtotalAfterDiscount >= FREE_SHIPPING_FROM ? 0 : FLAT_SHIPPING_FEE;
}

export type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  type: DiscountType;
  value: number;
  maxDiscountAmount: number | null;
  minOrderValue: number | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Why a coupon can't be used on this cart, in words for the shopper; null when it can.
 * `usedByCustomer` = this customer's earlier (not cancelled) orders with the coupon, when known.
 */
export function couponProblem(c: CouponRow | null, subtotal: number, now: Date, usedByCustomer = 0): string | null {
  if (!c || !c.isActive) return "This coupon code isn't valid";
  if (c.startsAt && now < c.startsAt) return "This coupon isn't active yet";
  if (c.endsAt && now > c.endsAt) return 'This coupon has expired';
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return 'This coupon has been fully used';
  if (c.perUserLimit !== null && usedByCustomer >= c.perUserLimit) {
    return c.perUserLimit === 1 ? "You've already used this coupon" : `You've already used this coupon ${c.perUserLimit} times`;
  }
  if (c.minOrderValue !== null && subtotal < c.minOrderValue) {
    return `Add ${rupees(c.minOrderValue - subtotal)} more to use this coupon (minimum order ${rupees(c.minOrderValue)})`;
  }
  return null;
}

/** The amount a valid coupon takes off: percent (with its cap) or flat — never more than the subtotal. */
export function couponDiscount(c: Pick<CouponRow, 'type' | 'value' | 'maxDiscountAmount'>, subtotal: number): number {
  const raw = c.type === 'PERCENTAGE' ? Math.floor((subtotal * c.value) / 100) : c.value;
  const capped = c.maxDiscountAmount !== null ? Math.min(raw, c.maxDiscountAmount) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}

export function totals(subtotal: number, discount: number) {
  const shipping = shippingFor(subtotal - discount);
  return { subtotal, discountTotal: discount, shippingTotal: shipping, taxTotal: 0, grandTotal: subtotal - discount + shipping };
}

/** "DIWALI 20 " → "DIWALI20" (codes are stored uppercase without spaces). */
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');
