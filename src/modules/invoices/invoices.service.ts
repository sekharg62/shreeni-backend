import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { normalizeOrderNumber } from '../orders/order-number.js';
import { OrdersService } from '../orders/orders.service.js';
import type { TrackOrderDto } from '../orders/dto/order.dto.js';
import { buildInvoiceLines, GSTIN_PATTERN, stateCode, stateName } from './gst.js';
import type { InvoiceDocument } from './invoice-document.js';
import { INVOICEABLE_STATUSES, InvoiceNumberRace, assignInvoiceNumber, invoicePrefix } from './invoice-number.js';
import { renderInvoicePdf } from './invoice-pdf.js';

/** When a product (or its rate) is gone, invoices use the shop's usual saree rate. */
const DEFAULT_GST_RATE = 5;

const INVOICE_SELECT = {
  id: true,
  orderNumber: true,
  invoiceNumber: true,
  invoicedAt: true,
  status: true,
  createdAt: true,
  cancelledAt: true,
  discountCode: true,
  discountTotal: true,
  shippingTotal: true,
  grandTotal: true,
  contactEmail: true,
  contactPhone: true,
  shipReceiverName: true,
  shipReceiverPhone: true,
  shipFlatHouseNo: true,
  shipApartmentSector: true,
  shipLandmark: true,
  shipCity: true,
  shipState: true,
  shipPincode: true,
  shipCountry: true,
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      name: true,
      size: true,
      sku: true,
      unitPrice: true,
      quantity: true,
      hsnCode: true,
      gstRate: true,
      product: { select: { hsnCode: true, gstRate: true } },
    },
  },
  payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { method: true, status: true, paidAt: true } },
  events: { where: { status: 'CONFIRMED' }, orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } },
} satisfies Prisma.OrderSelect;

type InvoiceRow = Prisma.OrderGetPayload<{ select: typeof INVOICE_SELECT }>;

type Seller = {
  legalName: string;
  brandName: string;
  gstin: string;
  address: string;
  state: string;
  email: string;
  phone: string;
  prefix: string;
};

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export type InvoiceFile = { filename: string; pdf: Buffer };

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly seller: Seller;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    config: ConfigService,
  ) {
    this.seller = config.get<Seller>('invoice') ?? {
      legalName: 'Shreeni',
      brandName: 'Shreeni',
      gstin: '',
      address: '',
      state: 'West Bengal',
      email: '',
      phone: '',
      prefix: 'SHR',
    };
    if (this.seller.gstin && !GSTIN_PATTERN.test(this.seller.gstin)) {
      this.logger.error(`INVOICE_GSTIN "${this.seller.gstin}" is not a valid GSTIN: issuing Bills of Supply until it's fixed`);
    }
  }

  /** Signed-in customer: only their own orders. */
  async forCustomer(userId: string, orderNumber: string): Promise<InvoiceFile> {
    const number = normalizeOrderNumber(orderNumber);
    const row = number ? await this.prisma.order.findFirst({ where: { orderNumber: number, userId }, select: { id: true } }) : null;
    if (!row) throw new NotFoundException('Order not found');
    return this.file(row.id);
  }

  /** Guests: the same order number + phone/email check as order tracking. */
  async forGuest(dto: TrackOrderDto): Promise<InvoiceFile> {
    const order = await this.orders.track(dto); // throws the usual "not found" on a mismatch
    const row = await this.prisma.order.findUniqueOrThrow({ where: { orderNumber: order.orderNumber }, select: { id: true } });
    return this.file(row.id);
  }

  /** Admin: any order. */
  forAdmin(orderId: string): Promise<InvoiceFile> {
    return this.file(orderId);
  }

  private async file(orderId: string): Promise<InvoiceFile> {
    const doc = await this.document(orderId);
    const pdf = await renderInvoicePdf(doc);
    return { filename: `${this.seller.brandName}-Invoice-${doc.invoiceNumber.replace(/\//g, '-')}.pdf`, pdf };
  }

  /** The invoice for an order, giving it a number first if it was confirmed before invoices existed. */
  async document(orderId: string): Promise<InvoiceDocument> {
    let row = await this.load(orderId);
    if (!row.invoiceNumber) {
      if (!(INVOICEABLE_STATUSES as readonly string[]).includes(row.status)) {
        throw new BadRequestException(
          row.status === 'CANCELLED'
            ? 'This order was cancelled before it was confirmed, so there is no invoice.'
            : 'The invoice is available once the order is confirmed.',
        );
      }
      await this.numberLegacyOrder(row);
      row = await this.load(orderId);
    }
    return this.build(row);
  }

  private async load(orderId: string): Promise<InvoiceRow> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId }, select: INVOICE_SELECT });
    if (!row) throw new NotFoundException('Order not found');
    return row;
  }

  /** Orders confirmed before invoices existed: numbered on first download, dated when they were confirmed. */
  private async numberLegacyOrder(row: InvoiceRow) {
    const at = row.events[0]?.createdAt ?? row.createdAt;
    const prefix = invoicePrefix(this.seller.prefix);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.prisma.$transaction((tx) => assignInvoiceNumber(tx, row.id, at, prefix));
        return;
      } catch (e) {
        // Someone numbered it meanwhile (fine), or two first-of-the-year counters raced: try again.
        if (e instanceof InvoiceNumberRace) return;
        if (attempt === 3) throw e;
      }
    }
  }

  private build(row: InvoiceRow): InvoiceDocument {
    const s = this.seller;
    const registered = GSTIN_PATTERN.test(s.gstin);
    const sellerCode = registered ? s.gstin.slice(0, 2) : stateCode(s.state);
    const sellerState = (sellerCode && stateName(sellerCode)) || s.state;
    const buyerCode = stateCode(row.shipState);
    const intraState = buyerCode && sellerCode ? buyerCode === sellerCode : row.shipState.trim().toLowerCase() === sellerState.toLowerCase();

    const { lines, totals } = buildInvoiceLines({
      items: row.items.map((i) => ({
        name: i.name,
        size: i.size,
        sku: i.sku,
        hsnCode: i.hsnCode ?? i.product?.hsnCode ?? null,
        gstRate: i.gstRate ?? i.product?.gstRate ?? DEFAULT_GST_RATE,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
      })),
      discountTotal: row.discountTotal,
      shippingTotal: row.shippingTotal,
      intraState,
      registered,
    });
    if (totals.total !== row.grandTotal) {
      // Shouldn't happen (same maths as checkout); logged so a mismatch is noticed, never hidden.
      this.logger.error(`Invoice total ${totals.total} ≠ order total ${row.grandTotal} for ${row.orderNumber}`);
    }

    const payment = row.payments[0];
    const paymentNote = !payment
      ? '—'
      : payment.method === 'COD'
        ? payment.status === 'PAID'
          ? `Cash on delivery · paid${payment.paidAt ? ` on ${dateFmt.format(payment.paidAt)}` : ''}`
          : 'Cash on delivery'
        : payment.status === 'PAID'
          ? `Paid online${payment.paidAt ? ` on ${dateFmt.format(payment.paidAt)}` : ''}`
          : payment.status === 'REFUNDED'
            ? 'Paid online · refunded'
            : 'Online payment';

    const notice =
      row.status === 'CANCELLED'
        ? `This order was cancelled${row.cancelledAt ? ` on ${dateFmt.format(row.cancelledAt)}` : ''} after this invoice was issued.`
        : row.status === 'RETURNED'
          ? 'This order was returned after this invoice was issued.'
          : null;

    return {
      title: registered ? 'Tax Invoice' : 'Bill of Supply',
      registered,
      intraState,
      seller: {
        brandName: s.brandName,
        legalName: s.legalName,
        addressLines: [...s.address.split(/\||\n/).map((l) => l.trim()).filter(Boolean), sellerState],
        state: sellerState,
        stateCode: sellerCode,
        gstin: registered ? s.gstin : null,
        email: s.email,
        phone: s.phone,
      },
      invoiceNumber: row.invoiceNumber!,
      invoiceDate: row.invoicedAt ?? row.createdAt,
      orderNumber: row.orderNumber,
      orderDate: row.createdAt,
      placeOfSupply: buyerCode ? `${row.shipState} (${buyerCode})` : row.shipState,
      buyer: {
        name: row.shipReceiverName,
        addressLines: [
          [row.shipFlatHouseNo, row.shipApartmentSector].filter(Boolean).join(', '),
          row.shipLandmark ? `Near ${row.shipLandmark}` : null,
          `${row.shipCity}, ${row.shipState} ${row.shipPincode}`,
          row.shipCountry,
        ].filter((l): l is string => Boolean(l)),
        phone: row.shipReceiverPhone,
        email: row.contactEmail,
      },
      lines,
      totals,
      discountCode: row.discountCode,
      paymentNote,
      notice,
    };
  }
}
