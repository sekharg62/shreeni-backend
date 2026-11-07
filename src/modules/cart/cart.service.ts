import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MAX_ORDERABLE, pricing } from '../products/public-products.service.js';
import { MAX_CART_LINES, type CartDto, type CartIssue, type CartItemInputDto, type CartLineDto } from './dto/cart.dto.js';

/** Everything needed to price and check one size. */
const VARIANT_SELECT = {
  id: true,
  size: true,
  stock: true,
  reservedStock: true,
  priceOverride: true,
  isActive: true,
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      originalPrice: true,
      discountPrice: true,
      images: {
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        take: 1,
        select: { url: true },
      },
    },
  },
} satisfies Prisma.ProductVariantSelect;

type VariantRow = Prisma.ProductVariantGetPayload<{ select: typeof VARIANT_SELECT }>;

const EMPTY: CartDto = { items: [], itemCount: 0, subtotal: 0 };
const FULL_MESSAGE = `Your cart can hold up to ${MAX_CART_LINES} different items.`;

/** How many can be ordered now: 0 when the product or size is off sale. */
function availableOf(v: VariantRow): number {
  if (!v.isActive || v.product.status !== 'PUBLISHED') return 0;
  return Math.min(MAX_ORDERABLE, Math.max(0, v.stock - v.reservedStock));
}

/** A cart line with today's price; quantity is lowered to what's left and the issue explains why. */
function toLine(v: VariantRow, wanted: number): CartLineDto {
  const offSale = !v.isActive || v.product.status !== 'PUBLISHED';
  const available = availableOf(v);
  let quantity = wanted;
  let issue: CartIssue | null = null;
  if (offSale) issue = 'UNAVAILABLE';
  else if (available === 0) issue = 'OUT_OF_STOCK';
  else if (wanted > available) {
    issue = 'QUANTITY_REDUCED';
    quantity = available;
  }
  const p = v.product;
  return {
    variantId: v.id,
    productId: p.id,
    slug: p.slug,
    name: p.name,
    image: p.images[0]?.url ?? null,
    size: v.size,
    // A size price override replaces the product price; the MRP stays the reference (same as the product page).
    ...pricing(p.originalPrice, v.priceOverride ?? p.discountPrice),
    quantity,
    available,
    issue,
  };
}

function toCart(items: CartLineDto[]): CartDto {
  const buyable = items.filter((l) => l.issue === null || l.issue === 'QUANTITY_REDUCED');
  return {
    items,
    itemCount: buyable.reduce((n, l) => n + l.quantity, 0),
    subtotal: buyable.reduce((n, l) => n + l.price * l.quantity, 0),
  };
}

/** Same variant twice → one line with the quantities added (capped later by stock). */
function combine(items: CartItemInputDto[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) out.set(i.variantId, (out.get(i.variantId) ?? 0) + i.quantity);
  return out;
}

/**
 * Shopping carts. Signed-in customers' carts live here; guests keep theirs in the browser
 * and use `preview` for live prices, then `merge` on sign-in.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /** The customer's cart with live prices. Lines that exceed stock are lowered (and saved) once. */
  async get(userId: string): Promise<CartDto> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: {
        id: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, quantity: true, variant: { select: VARIANT_SELECT } },
        },
      },
    });
    if (!cart) return EMPTY;

    const lines = cart.items.map((row) => toLine(row.variant, row.quantity));
    const lowered = cart.items.filter((row, i) => lines[i].issue === 'QUANTITY_REDUCED' && lines[i].quantity !== row.quantity);
    if (lowered.length > 0) {
      await this.prisma.$transaction(
        lowered.map((row) =>
          this.prisma.cartItem.update({ where: { id: row.id }, data: { quantity: availableOf(row.variant) } }),
        ),
      );
    }
    return toCart(lines);
  }

  /** Set a line's quantity: adds it if new, removes it at 0, caps it at what's available. */
  async setQuantity(userId: string, variantId: string, quantity: number): Promise<CartDto> {
    if (quantity === 0) return this.remove(userId, variantId);

    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId }, select: VARIANT_SELECT });
    if (!variant || !variant.isActive || variant.product.status !== 'PUBLISHED') {
      throw new NotFoundException('This item is no longer available');
    }
    const available = availableOf(variant);
    if (available === 0) throw new BadRequestException('Sorry, this size is out of stock');

    const cartId = await this.cartId(userId);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
      select: { id: true },
    });
    if (!existing && (await this.prisma.cartItem.count({ where: { cartId } })) >= MAX_CART_LINES) {
      throw new BadRequestException(FULL_MESSAGE);
    }

    const capped = Math.min(quantity, available);
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, productId: variant.product.id, quantity: capped },
      update: { quantity: capped },
    });
    return this.get(userId);
  }

  /** Removing a line that isn't there does nothing. */
  async remove(userId: string, variantId: string): Promise<CartDto> {
    await this.prisma.cartItem.deleteMany({ where: { variantId, cart: { userId } } });
    return this.get(userId);
  }

  async clear(userId: string): Promise<CartDto> {
    await this.prisma.cartItem.deleteMany({ where: { cart: { userId } } });
    return EMPTY;
  }

  /**
   * Add a guest's cart after sign-in. Sizes already in the cart get the quantities added together;
   * everything is capped at stock; sold-out or off-sale items and lines past the limit are skipped.
   */
  async merge(userId: string, items: CartItemInputDto[]): Promise<CartDto> {
    const wanted = combine(items);
    if (wanted.size === 0) return this.get(userId);

    const cartId = await this.cartId(userId);
    const [variants, existing] = await Promise.all([
      this.prisma.productVariant.findMany({ where: { id: { in: [...wanted.keys()] } }, select: VARIANT_SELECT }),
      this.prisma.cartItem.findMany({ where: { cartId }, select: { variantId: true, quantity: true } }),
    ]);
    const current = new Map(existing.map((e) => [e.variantId, e.quantity]));
    let lines = current.size;

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const v of variants) {
      const available = availableOf(v);
      if (available === 0) continue;
      const have = current.get(v.id);
      if (have === undefined && lines >= MAX_CART_LINES) continue;
      const quantity = Math.min((have ?? 0) + wanted.get(v.id)!, available);
      if (have === undefined) lines += 1;
      writes.push(
        this.prisma.cartItem.upsert({
          where: { cartId_variantId: { cartId, variantId: v.id } },
          create: { cartId, variantId: v.id, productId: v.product.id, quantity },
          update: { quantity },
        }),
      );
    }
    if (writes.length > 0) await this.prisma.$transaction(writes);
    return this.get(userId);
  }

  /**
   * Live prices and stock for a guest's browser cart. Saves nothing.
   * Sizes that no longer exist are left out, so the browser can drop them.
   */
  async preview(items: CartItemInputDto[]): Promise<CartDto> {
    const wanted = combine(items);
    if (wanted.size === 0) return EMPTY;
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: [...wanted.keys()] } },
      select: VARIANT_SELECT,
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    // Keep the browser's order.
    const lines = [...wanted.entries()]
      .filter(([id]) => byId.has(id))
      .map(([id, qty]) => toLine(byId.get(id)!, Math.min(qty, MAX_ORDERABLE)));
    return toCart(lines);
  }

  /** The customer's cart row, created the first time they add something. */
  private async cartId(userId: string): Promise<string> {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    return cart.id;
  }
}
