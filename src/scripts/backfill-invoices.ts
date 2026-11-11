/**
 * One-time backfill for orders placed before invoices existed:
 *   1. copies each order item's HSN code and GST rate from its product (where missing),
 *   2. gives every confirmed order (CONFIRMED/PACKED/SHIPPED/DELIVERED/RETURNED) without an
 *      invoice number its number, in the order they were confirmed, dated when they were confirmed.
 *
 * Safe to run more than once: anything already filled in is left alone.
 * Dry run (default) only reports; add --apply to write.
 *
 *   npm run db:backfill-invoices            # preview
 *   npm run db:backfill-invoices -- --apply # write
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { INVOICEABLE_STATUSES, assignInvoiceNumber, invoicePrefix } from '../modules/invoices/invoice-number.js';

const apply = process.argv.includes('--apply');
const prefix = invoicePrefix(process.env.INVOICE_PREFIX ?? 'SHR');

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
  });
  try {
    // 1. Tax snapshot on items.
    const items = await prisma.orderItem.findMany({
      where: { OR: [{ gstRate: null }, { hsnCode: null }], productId: { not: null } },
      select: { id: true, hsnCode: true, gstRate: true, product: { select: { hsnCode: true, gstRate: true } } },
    });
    const toFix = items.filter((i) => i.product && (i.gstRate === null || (i.hsnCode === null && i.product.hsnCode)));
    console.log(`Order items missing tax details: ${toFix.length}`);
    if (apply) {
      for (const i of toFix) {
        await prisma.orderItem.update({
          where: { id: i.id },
          data: {
            ...(i.gstRate === null && { gstRate: i.product!.gstRate }),
            ...(i.hsnCode === null && i.product!.hsnCode && { hsnCode: i.product!.hsnCode }),
          },
        });
      }
    }

    // 2. Invoice numbers, in the order the orders were confirmed.
    const orders = await prisma.order.findMany({
      where: { invoiceNumber: null, status: { in: [...INVOICEABLE_STATUSES] } },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        events: { where: { status: 'CONFIRMED' }, orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } },
      },
    });
    const queue = orders
      .map((o) => ({ ...o, confirmedAt: o.events[0]?.createdAt ?? o.createdAt }))
      .sort((a, b) => a.confirmedAt.getTime() - b.confirmedAt.getTime());
    console.log(`Confirmed orders without an invoice number: ${queue.length}`);

    for (const o of queue) {
      if (!apply) {
        console.log(`  would number ${o.orderNumber} (${o.status}, confirmed ${o.confirmedAt.toISOString()})`);
        continue;
      }
      const number = await prisma.$transaction((tx) => assignInvoiceNumber(tx, o.id, o.confirmedAt, prefix));
      console.log(`  ${o.orderNumber} → ${number}`);
    }
    if (!apply) console.log('\nDry run: nothing was changed. Run again with --apply to write.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
