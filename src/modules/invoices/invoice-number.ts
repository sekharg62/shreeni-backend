import type { Prisma } from '../../generated/prisma/client.js';
import { financialYear, formatInvoiceNumber, MAX_PREFIX_LENGTH } from './gst.js';

/** Statuses an order passes through once confirmed: these get an invoice. */
export const INVOICEABLE_STATUSES = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED'] as const;

/** "SHR" from settings; anything unusable falls back to "INV". */
export function invoicePrefix(raw: string | undefined): string {
  const p = (raw ?? '').trim().toUpperCase();
  return /^[A-Z0-9]+$/.test(p) && p.length <= MAX_PREFIX_LENGTH ? p : 'INV';
}

/**
 * Give an order its invoice number, dated `at`. Call it INSIDE the transaction that confirms the
 * order: the counter and the order are updated together, so a rolled-back confirmation never
 * uses up a number (GST wants a continuous series). Does nothing if the order already has one.
 */
export async function assignInvoiceNumber(
  tx: Prisma.TransactionClient,
  orderId: string,
  at: Date,
  prefix: string,
): Promise<string | null> {
  const current = await tx.order.findUnique({ where: { id: orderId }, select: { invoiceNumber: true } });
  if (!current) return null;
  if (current.invoiceNumber) return current.invoiceNumber;

  const fy = financialYear(at);
  // Row-locking increment: concurrent confirmations queue up here and get consecutive numbers.
  const seq = await tx.invoiceSequence.upsert({
    where: { financialYear: fy },
    create: { financialYear: fy, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  const invoiceNumber = formatInvoiceNumber(prefix, fy, seq.lastNumber);
  const updated = await tx.order.updateMany({
    where: { id: orderId, invoiceNumber: null },
    data: { invoiceNumber, invoicedAt: at },
  });
  // Someone else numbered it meanwhile: roll back so this number isn't wasted.
  if (updated.count === 0) throw new InvoiceNumberRace();
  return invoiceNumber;
}

export class InvoiceNumberRace extends Error {
  constructor() {
    super('Order was given an invoice number concurrently');
  }
}
