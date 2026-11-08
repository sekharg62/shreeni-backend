import { randomInt } from 'node:crypto';

/** IST is UTC+5:30 all year (no daylight saving), so the date part follows the shop's calendar. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Order numbers: "OD" + date (YYMMDD, India time) + 6 random digits, e.g. OD261108482913.
 *
 * - The date makes numbers readable ("placed on 8 Nov 2026") and sortable by day.
 * - The random part (1,000,000 per day) keeps them unguessable — guests track orders by number,
 *   so sequential or timestamp numbers would let anyone look up other people's orders.
 * - Uniqueness is enforced by the database; on the rare clash the caller retries with a new number.
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const yymmdd = ist.toISOString().slice(2, 10).replace(/-/g, '');
  const random = randomInt(0, 1_000_000).toString().padStart(6, '0');
  return `OD${yymmdd}${random}`;
}

export const ORDER_NUMBER_PATTERN = /^OD\d{12}$/;

/** " od261108482913 " → "OD261108482913"; null if it can't be an order number. */
export function normalizeOrderNumber(input: string): string | null {
  const value = input.trim().toUpperCase().replace(/\s+/g, '');
  return ORDER_NUMBER_PATTERN.test(value) ? value : null;
}
