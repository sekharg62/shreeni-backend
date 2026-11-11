import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { OrderStatus } from '../../generated/prisma/enums.js';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { INVOICEABLE_STATUSES, assignInvoiceNumber, invoicePrefix } from '../invoices/invoice-number.js';
import type { AuthUser } from '../../common/authz/auth-user.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import { normalizeIndianPhone } from '../auth/phone.js';
import { CartService } from '../cart/cart.service.js';
import { PincodesService } from '../pincodes/pincodes.service.js';
import { MAX_ORDERABLE, pricing } from '../products/public-products.service.js';
import type {
  CheckoutQuoteDto,
  CheckoutQuoteRequestDto,
  MyOrdersQueryDto,
  OrderDetailDto,
  OrderPageDto,
  OrderSummaryDto,
  PlaceOrderDto,
  TrackOrderDto,
} from './dto/order.dto.js';
import { generateOrderNumber, normalizeOrderNumber } from './order-number.js';
import { couponDiscount, couponProblem, normalizeCouponCode, totals, type CouponRow } from './order-pricing.js';
import { CUSTOMER_CANCELLABLE, STATUS_LABEL, canMove, stockEffect } from './order-status.js';
import { PAYMENT_OPTIONS, paymentProvider, providerByName } from './payments/payment-provider.js';

/** Interactive transactions talk to a remote database: allow a few seconds per order. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };
const ORDER_NUMBER_ATTEMPTS = 5;

const ITEM_SELECT = {
  name: true,
  size: true,
  image: true,
  unitPrice: true,
  quantity: true,
  product: { select: { slug: true, status: true } },
} satisfies Prisma.OrderItemSelect;

export const ORDER_DETAIL_SELECT = {
  id: true,
  orderNumber: true,
  invoiceNumber: true,
  userId: true,
  status: true,
  createdAt: true,
  subtotal: true,
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
  cancelledAt: true,
  cancelReason: true,
  items: { orderBy: { createdAt: 'asc' }, select: ITEM_SELECT },
  payments: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { method: true, provider: true, status: true, amount: true, paidAt: true },
  },
  shipment: { select: { deliveryPartner: true, awb: true, status: true, shippedAt: true, deliveredAt: true } },
  events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
} satisfies Prisma.OrderSelect;

const SUMMARY_SELECT = {
  orderNumber: true,
  status: true,
  createdAt: true,
  grandTotal: true,
  items: { orderBy: { createdAt: 'asc' }, select: { ...ITEM_SELECT } },
} satisfies Prisma.OrderSelect;

type DetailRow = Prisma.OrderGetPayload<{ select: typeof ORDER_DETAIL_SELECT }>;
type ItemRow = Prisma.OrderItemGetPayload<{ select: typeof ITEM_SELECT }>;

const VARIANT_SELECT = {
  id: true,
  size: true,
  sku: true,
  stock: true,
  reservedStock: true,
  priceOverride: true,
  isActive: true,
  product: {
    select: {
      id: true,
      name: true,
      status: true,
      originalPrice: true,
      discountPrice: true,
      hsnCode: true,
      gstRate: true,
      images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { url: true } },
    },
  },
} satisfies Prisma.ProductVariantSelect;

const COUPON_SELECT = {
  id: true,
  code: true,
  description: true,
  type: true,
  value: true,
  maxDiscountAmount: true,
  minOrderValue: true,
  usageLimit: true,
  usedCount: true,
  perUserLimit: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
} satisfies Prisma.DiscountSelect;

function toItem(i: ItemRow) {
  return {
    name: i.name,
    slug: i.product?.status === 'PUBLISHED' ? i.product.slug : null,
    size: i.size,
    image: i.image,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    lineTotal: i.unitPrice * i.quantity,
  };
}

export function toOrderDetail(o: DetailRow): OrderDetailDto {
  const payment = o.payments[0] ?? null;
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    placedAt: o.createdAt,
    items: o.items.map(toItem),
    itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    subtotal: o.subtotal,
    discountCode: o.discountCode,
    discountTotal: o.discountTotal,
    shippingTotal: o.shippingTotal,
    grandTotal: o.grandTotal,
    contactEmail: o.contactEmail,
    contactPhone: o.contactPhone,
    shippingAddress: {
      receiverName: o.shipReceiverName,
      receiverPhone: o.shipReceiverPhone,
      flatHouseNo: o.shipFlatHouseNo,
      apartmentSector: o.shipApartmentSector,
      landmark: o.shipLandmark,
      city: o.shipCity,
      state: o.shipState,
      pincode: o.shipPincode,
      country: o.shipCountry,
    },
    payment,
    shipment: o.shipment,
    timeline: o.events.map((e) => ({ status: e.status, label: STATUS_LABEL[e.status], note: e.note, at: e.createdAt })),
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    canCancel: CUSTOMER_CANCELLABLE.includes(o.status),
    invoiceNumber: o.invoiceNumber,
    // Confirmed orders (and cancelled/returned ones that were already invoiced) have an invoice.
    hasInvoice: o.invoiceNumber !== null || (INVOICEABLE_STATUSES as readonly string[]).includes(o.status),
  };
}

function toSummary(o: Prisma.OrderGetPayload<{ select: typeof SUMMARY_SELECT }>): OrderSummaryDto {
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    placedAt: o.createdAt,
    grandTotal: o.grandTotal,
    itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    previewItems: o.items.slice(0, 3).map(toItem),
  };
}

/** Same size twice → one line, quantities added. */
function combine(items: { variantId: string; quantity: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) out.set(i.variantId, (out.get(i.variantId) ?? 0) + i.quantity);
  return out;
}

const isUniqueViolation = (e: unknown, field: string) =>
  e instanceof Prisma.PrismaClientKnownRequestError &&
  e.code === 'P2002' &&
  JSON.stringify(e.meta ?? {}).includes(field);

type Transition = {
  actorId: string | null;
  note?: string;
  cancelReason?: string;
  deliveryPartner?: string;
  awb?: string;
};

/**
 * Orders: checkout quote, placing an order (stock + coupon reserved atomically), payment confirmation,
 * the customer's order history, guest tracking, and every status change (shared with the admin).
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  /** Invoice series prefix, e.g. "SHR" → SHR/26-27/0001. */
  private readonly invoicePrefix: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly pincodes: PincodesService,
    config: ConfigService,
  ) {
    this.invoicePrefix = invoicePrefix(config.get<string>('invoice.prefix') ?? 'SHR');
  }

  /* ───────────── Checkout ───────────── */

  /** Live prices, coupon and totals for the checkout summary. Nothing is saved. */
  async quote(user: AuthUser | undefined, dto: CheckoutQuoteRequestDto): Promise<CheckoutQuoteDto> {
    const cart = await this.cart.preview(dto.items);
    const blocked = cart.items.some((l) => l.issue !== null);
    let coupon: CheckoutQuoteDto['coupon'] = null;
    let couponError: string | null = null;
    if (dto.couponCode) {
      const who = user?.role === 'CUSTOMER' ? await this.customerContact(user.sub) : null;
      const result = await this.evaluateCoupon(dto.couponCode, cart.subtotal, who);
      if ('error' in result) couponError = result.error;
      else coupon = { code: result.coupon.code, description: result.coupon.description, discount: result.discount };
    }
    return {
      items: cart.items,
      itemCount: cart.itemCount,
      ...totals(cart.subtotal, coupon?.discount ?? 0),
      coupon,
      couponError,
      canPlaceOrder: cart.items.length > 0 && !blocked,
      paymentOptions: PAYMENT_OPTIONS.map((value) => ({ value, label: paymentProvider(value).label })),
    };
  }

  /**
   * Place an order. Prices, stock and the coupon are checked again here (never trusted from the browser).
   * One transaction reserves the stock, uses up the coupon and saves the order (PENDING); then the payment
   * provider is asked to collect, and a successful payment confirms the order.
   * Sending the same idempotencyKey again returns the first order instead of creating another.
   */
  async place(user: AuthUser | undefined, dto: PlaceOrderDto): Promise<OrderDetailDto> {
    if (user && user.role !== 'CUSTOMER') throw new ForbiddenException('Only customer accounts can place orders');
    const userId = user?.sub ?? null;

    const repeat = await this.byIdempotencyKey(dto.idempotencyKey, userId);
    if (repeat) return repeat;

    const { contact, address } = await this.deliveryDetails(userId, dto);
    const lines = await this.priceLines(dto.items);
    const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);

    let couponRow: CouponRow | null = null;
    let discount = 0;
    if (dto.couponCode) {
      const result = await this.evaluateCoupon(dto.couponCode, subtotal, { userId, phone: contact.phone });
      if ('error' in result) throw new BadRequestException(result.error);
      couponRow = result.coupon;
      discount = result.discount;
    }
    const sums = totals(subtotal, discount);
    const provider = paymentProvider(dto.paymentMethod);

    let orderId: string | undefined;
    for (let attempt = 1; !orderId; attempt++) {
      try {
        orderId = await this.prisma.$transaction(async (tx) => {
          for (const l of lines) {
            const reserved = await tx.$executeRaw`
              UPDATE "ProductVariant" SET "reservedStock" = "reservedStock" + ${l.quantity}
              WHERE "id" = ${l.variantId}::uuid AND "isActive" = true AND "stock" - "reservedStock" >= ${l.quantity}`;
            if (reserved === 0) {
              throw new ConflictException(`Sorry, ${l.name}${l.size ? ` (${l.size})` : ''} just sold out. Please update your cart.`);
            }
          }
          if (couponRow) {
            const used = await tx.$executeRaw`
              UPDATE "Discount" SET "usedCount" = "usedCount" + 1
              WHERE "id" = ${couponRow.id}::uuid AND "isActive" = true
                AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
            if (used === 0) throw new BadRequestException('This coupon has been fully used');
          }
          const order = await tx.order.create({
            data: {
              orderNumber: generateOrderNumber(),
              idempotencyKey: dto.idempotencyKey,
              userId,
              contactEmail: contact.email,
              contactPhone: contact.phone,
              status: 'PENDING',
              ...sums,
              discountId: couponRow?.id ?? null,
              discountCode: couponRow?.code ?? null,
              shipReceiverName: address.receiverName,
              shipReceiverPhone: address.receiverPhone,
              shipFlatHouseNo: address.flatHouseNo,
              shipApartmentSector: address.apartmentSector ?? null,
              shipLandmark: address.landmark ?? null,
              shipCity: address.city,
              shipState: address.state,
              shipPincode: address.pincode,
              items: {
                create: lines.map((l) => ({
                  productId: l.productId,
                  variantId: l.variantId,
                  name: l.name,
                  sku: l.sku,
                  size: l.size,
                  image: l.image,
                  unitPrice: l.unitPrice,
                  quantity: l.quantity,
                  hsnCode: l.hsnCode,
                  gstRate: l.gstRate,
                })),
              },
              payments: {
                create: { provider: provider.name, method: provider.method, amount: sums.grandTotal, status: 'CREATED' },
              },
              events: { create: { status: 'PENDING', note: 'Order placed', actorId: userId } },
            },
            select: { id: true },
          });
          return order.id;
        }, TX_OPTIONS);
      } catch (e) {
        if (isUniqueViolation(e, 'idempotencyKey')) {
          const first = await this.byIdempotencyKey(dto.idempotencyKey, userId);
          if (first) return first;
        }
        // Two orders drew the same number (1 in a million per day): try again with a new one.
        if (isUniqueViolation(e, 'orderNumber') && attempt < ORDER_NUMBER_ATTEMPTS) continue;
        throw e;
      }
    }

    const { orderNumber } = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true } });
    const result = await provider.start({ orderNumber, amount: sums.grandTotal });
    if (result.status === 'PAID') {
      await this.confirmPayment(orderId, result.gatewayTxnId ?? null);
    } else if (result.status === 'FAILED') {
      await this.prisma.payment.updateMany({ where: { orderId, status: 'CREATED' }, data: { status: 'FAILED' } });
    } else if (result.gatewayOrderId) {
      await this.prisma.payment.updateMany({ where: { orderId, status: 'CREATED' }, data: { gatewayOrderId: result.gatewayOrderId } });
    }

    // The bought sizes leave the signed-in cart (guests' browser carts are cleared by the storefront).
    if (userId) {
      await this.prisma.cartItem.deleteMany({ where: { cart: { userId }, variantId: { in: lines.map((l) => l.variantId) } } });
    }
    return this.detail({ id: orderId });
  }

  /**
   * Payment received: the reserved stock is taken from inventory and the order is CONFIRMED.
   * Safe to call twice (gateway webhooks retry): only a PENDING order moves.
   */
  async confirmPayment(orderId: string, gatewayTxnId: string | null, actorId: string | null = null, note = 'Payment received') {
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
      if (moved.count === 0) return;
      await this.takeReservedStock(tx, orderId);
      await tx.payment.updateMany({
        where: { orderId, status: { in: ['CREATED', 'FAILED'] } },
        data: { status: 'PAID', paidAt: new Date(), ...(gatewayTxnId && { gatewayTxnId }) },
      });
      await tx.orderEvent.create({ data: { orderId, status: 'CONFIRMED', note, actorId } });
      // Same transaction: the invoice number is only used up if the confirmation sticks.
      await assignInvoiceNumber(tx, orderId, new Date(), this.invoicePrefix);
    }, TX_OPTIONS);
  }

  /* ───────────── Customer ───────────── */

  async listMine(userId: string, q: MyOrdersQueryDto): Promise<OrderPageDto> {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, select: SUMMARY_SELECT, ...pageArgs(q.page, q.limit) }),
      this.prisma.order.count({ where }),
    ]);
    return paginated(rows.map(toSummary), total, q.page, q.limit);
  }

  async getMine(userId: string, orderNumber: string): Promise<OrderDetailDto> {
    const number = normalizeOrderNumber(orderNumber);
    if (!number) throw new NotFoundException('Order not found');
    const row = await this.prisma.order.findFirst({ where: { orderNumber: number, userId }, select: ORDER_DETAIL_SELECT });
    if (!row) throw new NotFoundException('Order not found');
    return toOrderDetail(row);
  }

  async cancelMine(userId: string, orderNumber: string, reason?: string): Promise<OrderDetailDto> {
    const number = normalizeOrderNumber(orderNumber);
    const order = number
      ? await this.prisma.order.findFirst({ where: { orderNumber: number, userId }, select: { id: true, status: true } })
      : null;
    if (!order) throw new NotFoundException('Order not found');
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      throw new BadRequestException(
        order.status === 'CANCELLED'
          ? 'This order is already cancelled'
          : 'This order has already been packed, so it can no longer be cancelled here. Please contact us for help.',
      );
    }
    await this.transition(order.id, 'CANCELLED', { actorId: userId, cancelReason: reason, note: reason ? `Cancelled by you: ${reason}` : 'Cancelled by you' });
    return this.detail({ id: order.id });
  }

  /** Guests (and anyone) look an order up by its number + the phone or email given at checkout. */
  async track(dto: TrackOrderDto): Promise<OrderDetailDto> {
    const notFound = new NotFoundException("We couldn't find an order with these details. Check the order ID and the phone or email you used.");
    const number = normalizeOrderNumber(dto.orderNumber);
    if (!number) throw notFound;
    const row = await this.prisma.order.findUnique({ where: { orderNumber: number }, select: ORDER_DETAIL_SELECT });
    if (!row) throw notFound;
    const contact = dto.contact.trim();
    const matches = contact.includes('@')
      ? !!row.contactEmail && row.contactEmail.toLowerCase() === contact.toLowerCase()
      : [row.contactPhone, row.shipReceiverPhone].includes(normalizeIndianPhone(contact) ?? '');
    if (!matches) throw notFound;
    return { ...toOrderDetail(row), canCancel: false };
  }

  /* ───────────── Status changes (customer cancel + admin) ───────────── */

  /**
   * Move an order to `to`, with everything that goes with it: stock released/restocked, coupon use given back
   * on cancellation, shipment details on SHIPPED/DELIVERED, a timeline entry, and a refund for paid orders.
   */
  async transition(orderId: string, to: OrderStatus, t: Transition): Promise<void> {
    if (to === 'SHIPPED' && !t.deliveryPartner) throw new BadRequestException('Enter the courier (delivery partner) to mark it shipped');

    let refundNeeded = false;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, discountId: true, payments: { where: { status: 'PAID' }, select: { id: true } } },
      });
      if (!order) throw new NotFoundException('Order not found');
      const from = order.status;
      if (!canMove(from, to)) {
        throw new BadRequestException(`An order that is ${from.toLowerCase()} can't be marked ${to.toLowerCase()}`);
      }

      const now = new Date();
      // Only move if nobody else changed it meanwhile.
      const moved = await tx.order.updateMany({
        where: { id: orderId, status: from },
        data: { status: to, ...(to === 'CANCELLED' && { cancelledAt: now, cancelReason: t.cancelReason ?? null }) },
      });
      if (moved.count === 0) throw new ConflictException('This order was just updated. Refresh and try again.');

      if (from === 'PENDING' && to === 'CONFIRMED') {
        await this.takeReservedStock(tx, orderId);
        await tx.payment.updateMany({ where: { orderId, status: { in: ['CREATED', 'FAILED'] } }, data: { status: 'PAID', paidAt: now } });
        await assignInvoiceNumber(tx, orderId, now, this.invoicePrefix);
      }

      const effect = stockEffect(from, to);
      if (effect) {
        const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } }, select: { variantId: true, quantity: true } });
        for (const i of items) {
          await tx.productVariant.update({
            where: { id: i.variantId! },
            data: effect === 'release' ? { reservedStock: { decrement: i.quantity } } : { stock: { increment: i.quantity } },
          });
        }
      }

      if (to === 'CANCELLED' && order.discountId) {
        await tx.discount.updateMany({ where: { id: order.discountId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
      }

      if (to === 'SHIPPED') {
        const shipment = { deliveryPartner: t.deliveryPartner!, awb: t.awb ?? null, status: 'SHIPPED' as const, shippedAt: now };
        await tx.shipment.upsert({ where: { orderId }, create: { orderId, ...shipment }, update: shipment });
      } else if (to === 'DELIVERED') {
        await tx.shipment.updateMany({ where: { orderId }, data: { status: 'DELIVERED', deliveredAt: now } });
      } else if (to === 'RETURNED') {
        await tx.shipment.updateMany({ where: { orderId }, data: { status: 'RETURNED' } });
      }

      refundNeeded = (to === 'CANCELLED' || to === 'RETURNED') && order.payments.length > 0;
      const shippedNote = to === 'SHIPPED' ? `Shipped with ${t.deliveryPartner}${t.awb ? ` · Tracking no. ${t.awb}` : ''}` : null;
      const refundNote = refundNeeded ? 'Refund initiated' : null;
      const note = [shippedNote, t.note, refundNote].filter(Boolean).join(' · ') || null;
      await tx.orderEvent.create({ data: { orderId, status: to, note, actorId: t.actorId } });
    }, TX_OPTIONS);

    if (refundNeeded) await this.refund(orderId);
  }

  /* ───────────── Helpers ───────────── */

  async detail(where: Prisma.OrderWhereUniqueInput): Promise<OrderDetailDto> {
    const row = await this.prisma.order.findUnique({ where, select: ORDER_DETAIL_SELECT });
    if (!row) throw new NotFoundException('Order not found');
    return toOrderDetail(row);
  }

  /** PENDING → paid: the reservation becomes a sale. */
  private async takeReservedStock(tx: Prisma.TransactionClient, orderId: string) {
    const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } }, select: { variantId: true, quantity: true } });
    for (const i of items) {
      await tx.productVariant.update({
        where: { id: i.variantId! },
        data: { stock: { decrement: i.quantity }, reservedStock: { decrement: i.quantity } },
      });
    }
  }

  /** Refund paid payments through the provider that took them. Failures are logged for manual follow-up. */
  private async refund(orderId: string) {
    const paid = await this.prisma.payment.findMany({ where: { orderId, status: 'PAID' } });
    for (const p of paid) {
      const provider = providerByName(p.provider);
      try {
        if (provider && (await provider.refund({ gatewayTxnId: p.gatewayTxnId, amount: p.amount }))) {
          await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED' } });
          continue;
        }
      } catch (e) {
        this.logger.error(`Refund failed for payment ${p.id}`, e instanceof Error ? e.stack : String(e));
      }
      this.logger.warn(`Payment ${p.id} (order ${orderId}) needs a manual refund`);
    }
  }

  /** The earlier order for this key — only if it belongs to the same shopper. */
  private async byIdempotencyKey(key: string, userId: string | null): Promise<OrderDetailDto | null> {
    const row = await this.prisma.order.findUnique({ where: { idempotencyKey: key }, select: ORDER_DETAIL_SELECT });
    if (!row) return null;
    if (row.userId !== userId) throw new ConflictException('This checkout was already used. Please reload the page.');
    return toOrderDetail(row);
  }

  private async customerContact(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
    if (!user) throw new ForbiddenException('Account not found');
    return { userId, phone: user.phone, email: user.email };
  }

  /** Contact + delivery address: a saved address for customers, typed-in details for guests. */
  private async deliveryDetails(userId: string | null, dto: PlaceOrderDto) {
    if (userId) {
      if (!dto.addressId) throw new BadRequestException('Choose a delivery address');
      const [contact, address] = await Promise.all([
        this.customerContact(userId),
        this.prisma.address.findFirst({ where: { id: dto.addressId, userId } }),
      ]);
      if (!address) throw new BadRequestException('That address was not found. Please choose another.');
      return { contact: { email: contact.email, phone: contact.phone }, address };
    }

    const g = dto.guest;
    if (!g) throw new BadRequestException('Enter your contact details and delivery address');
    const phone = normalizeIndianPhone(g.phone);
    const receiverPhone = normalizeIndianPhone(g.address.receiverPhone);
    if (!phone || !receiverPhone) throw new BadRequestException('Enter a valid 10-digit mobile number');
    await this.pincodes.assertValidForState(g.address.pincode, g.address.state);
    return { contact: { email: g.email.toLowerCase(), phone }, address: { ...g.address, receiverPhone } };
  }

  /** Today's price and availability for each line; refuses anything sold out or off sale. */
  private async priceLines(items: { variantId: string; quantity: number }[]) {
    const wanted = combine(items);
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: [...wanted.keys()] } }, select: VARIANT_SELECT });
    const byId = new Map(variants.map((v) => [v.id, v]));
    return [...wanted.entries()].map(([variantId, quantity]) => {
      const v = byId.get(variantId);
      if (!v || !v.isActive || v.product.status !== 'PUBLISHED') {
        throw new ConflictException(`${v?.product.name ?? 'An item in your cart'} is no longer available. Please update your cart.`);
      }
      const available = Math.min(MAX_ORDERABLE, Math.max(0, v.stock - v.reservedStock));
      if (quantity > available) {
        throw new ConflictException(
          available === 0
            ? `Sorry, ${v.product.name} (${v.size}) is out of stock. Please update your cart.`
            : `Only ${available} left of ${v.product.name} (${v.size}). Please update your cart.`,
        );
      }
      return {
        variantId,
        quantity,
        productId: v.product.id,
        name: v.product.name,
        size: v.size,
        sku: v.sku,
        image: v.product.images[0]?.url ?? null,
        unitPrice: pricing(v.product.originalPrice, v.priceOverride ?? v.product.discountPrice).price,
        hsnCode: v.product.hsnCode,
        gstRate: v.product.gstRate,
      };
    });
  }

  /** The coupon and its amount, or why it can't be used. Per-customer limits count orders by account or phone. */
  private async evaluateCoupon(
    code: string,
    subtotal: number,
    who: { userId?: string | null; phone?: string } | null,
  ): Promise<{ coupon: CouponRow; discount: number } | { error: string }> {
    const coupon = await this.prisma.discount.findUnique({ where: { code: normalizeCouponCode(code) }, select: COUPON_SELECT });
    let used = 0;
    if (coupon?.perUserLimit && who && (who.userId || who.phone)) {
      used = await this.prisma.order.count({
        where: {
          discountId: coupon.id,
          status: { not: 'CANCELLED' },
          OR: [...(who.userId ? [{ userId: who.userId }] : []), ...(who.phone ? [{ contactPhone: who.phone }] : [])],
        },
      });
    }
    const problem = couponProblem(coupon, subtotal, new Date(), used);
    if (problem || !coupon) return { error: problem ?? "This coupon code isn't valid" };
    return { coupon, discount: couponDiscount(coupon, subtotal) };
  }
}
