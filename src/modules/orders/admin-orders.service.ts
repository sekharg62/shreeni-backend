import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { OrderStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import type { AdminOrderStatusDto, AdminOrdersQueryDto } from './dto/order.dto.js';
import { NEXT_STATUSES, STATUS_LABEL } from './order-status.js';
import { OrdersService } from './orders.service.js';

const LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  grandTotal: true,
  discountCode: true,
  contactPhone: true,
  contactEmail: true,
  shipReceiverName: true,
  shipCity: true,
  shipState: true,
  userId: true,
  items: { select: { quantity: true } },
  payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, provider: true, method: true } },
} satisfies Prisma.OrderSelect;

const DETAIL_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  subtotal: true,
  discountCode: true,
  discountTotal: true,
  shippingTotal: true,
  taxTotal: true,
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
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      sku: true,
      size: true,
      image: true,
      unitPrice: true,
      quantity: true,
      productId: true,
      variantId: true,
      product: { select: { slug: true } },
    },
  },
  payments: {
    orderBy: { createdAt: 'desc' },
    select: { id: true, provider: true, method: true, amount: true, status: true, gatewayOrderId: true, gatewayTxnId: true, paidAt: true, createdAt: true },
  },
  shipment: { select: { deliveryPartner: true, awb: true, status: true, shippedAt: true, deliveredAt: true } },
  events: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, note: true, createdAt: true, actor: { select: { firstName: true, lastName: true, role: true } } },
  },
} satisfies Prisma.OrderSelect;

/** Start of today in India (UTC+5:30), as a UTC Date. */
function startOfTodayIst(now = new Date()): Date {
  const offset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + offset);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - offset);
}

/** Admin order desk: find orders, see everything about one, and move it through its life cycle. */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async list(q: AdminOrdersQueryDto) {
    const where = this.where(q);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, orderBy: { [q.sortBy]: q.sortOrder }, select: LIST_SELECT, ...pageArgs(q.page, q.limit) }),
      this.prisma.order.count({ where }),
    ]);
    const data = rows.map(({ items, payments, ...o }) => ({
      ...o,
      isGuest: o.userId === null,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      payment: payments[0] ?? null,
    }));
    return paginated(data, total, q.page, q.limit);
  }

  /** Orders per status (tabs, sidebar badge) and today's numbers (dashboard). */
  async counts() {
    const today = startOfTodayIst();
    const [byStatus, todayOrders] = await this.prisma.$transaction([
      this.prisma.order.groupBy({ by: ['status'], orderBy: { status: 'asc' }, _count: { _all: true } }),
      this.prisma.order.aggregate({
        where: { createdAt: { gte: today }, status: { notIn: ['CANCELLED', 'PENDING'] } },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
    ]);
    const counts = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const row of byStatus) {
      const c = row._count;
      counts[row.status] = typeof c === 'object' && c ? (c._all ?? 0) : 0;
    }
    return {
      ...counts,
      ALL: Object.values(counts).reduce((a, b) => a + b, 0),
      /** Paid orders waiting to be packed/shipped. */
      TO_FULFIL: counts.CONFIRMED + counts.PACKED,
      today: { orders: todayOrders._count._all, revenue: todayOrders._sum.grandTotal ?? 0 },
    };
  }

  async get(id: string) {
    const row = await this.prisma.order.findUnique({ where: { id }, select: DETAIL_SELECT });
    if (!row) throw new NotFoundException(`Order ${id} not found`);
    return {
      ...row,
      isGuest: row.user === null,
      events: row.events.map((e) => ({ ...e, label: STATUS_LABEL[e.status] })),
      /** Statuses the admin can move this order to next. */
      nextStatuses: NEXT_STATUSES[row.status],
    };
  }

  async setStatus(adminId: string, id: string, dto: AdminOrderStatusDto) {
    if (dto.status === 'CANCELLED' && !dto.note) {
      throw new BadRequestException('Add a short reason for the cancellation (the customer will see it)');
    }
    await this.orders.transition(id, dto.status, {
      actorId: adminId,
      note: dto.status === 'CANCELLED' ? `Cancelled by Shreeni: ${dto.note}` : dto.note,
      cancelReason: dto.note,
      deliveryPartner: dto.deliveryPartner,
      awb: dto.awb,
    });
    return this.get(id);
  }

  private where(q: AdminOrdersQueryDto): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.from) and.push({ createdAt: { gte: new Date(q.from) } });
    if (q.to) {
      const end = new Date(q.to);
      // A bare date ("2026-11-08") means the whole of that day.
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) end.setUTCDate(end.getUTCDate() + 1);
      and.push({ createdAt: { lt: end } });
    }
    const s = q.search?.trim();
    if (s) {
      const digits = s.replace(/\D/g, '');
      and.push({
        OR: [
          { orderNumber: { contains: s.toUpperCase().replace(/\s+/g, '') } },
          { contactEmail: { contains: s, mode: 'insensitive' } },
          { shipReceiverName: { contains: s, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ contactPhone: { contains: digits.slice(-10) } }, { shipReceiverPhone: { contains: digits.slice(-10) } }] : []),
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }
}
