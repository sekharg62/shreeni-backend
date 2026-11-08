import type { OrderStatus } from '../../generated/prisma/enums.js';

/*
 * Order life cycle:
 *
 *   PENDING ──paid──▶ CONFIRMED ──▶ PACKED ──▶ SHIPPED ──▶ DELIVERED ──▶ RETURNED
 *      │                 │            │           └──────(RTO)─────────────▲
 *      └────────────── CANCELLED ◀────┘
 *
 * PENDING   = placed, waiting for payment (stock reserved, not yet taken)
 * CONFIRMED = paid; stock taken from inventory
 * Cancelling before shipping puts the stock back; RETURNED puts it back too.
 */
export const NEXT_STATUSES: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

export const canMove = (from: OrderStatus, to: OrderStatus) => NEXT_STATUSES[from].includes(to);

/** Customers may cancel themselves until the parcel is packed. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ['PENDING', 'CONFIRMED'];

/** Shopper-facing words for each status (timeline, emails later). */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Order placed',
  CONFIRMED: 'Order confirmed',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

/**
 * What a move does to inventory, per ordered size:
 * - "release": PENDING stock reservation is dropped (reservedStock −= qty)
 * - "restock": sold stock comes back (stock += qty)
 */
export function stockEffect(from: OrderStatus, to: OrderStatus): 'release' | 'restock' | null {
  if (to === 'CANCELLED') return from === 'PENDING' ? 'release' : 'restock';
  if (to === 'RETURNED') return 'restock';
  return null;
}
