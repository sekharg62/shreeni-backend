/* eslint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers (expect.any …) are typed `any` */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { CartService } from './cart.service.js';
import { MAX_CART_LINES } from './dto/cart.dto.js';

const USER = '11111111-1111-4111-8111-111111111111';
const CART = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const V2 = '44444444-4444-4444-8444-444444444444';
const V3 = '55555555-5555-4555-8555-555555555555';

type VariantOpts = { stock?: number; reserved?: number; active?: boolean; status?: string; override?: number | null };

const variant = (id: string, o: VariantOpts = {}) => ({
  id,
  size: 'Free Size',
  stock: o.stock ?? 5,
  reservedStock: o.reserved ?? 0,
  priceOverride: o.override ?? null,
  isActive: o.active ?? true,
  product: {
    id: `p-${id.slice(0, 4)}`,
    name: `Saree ${id.slice(0, 4)}`,
    slug: `saree-${id.slice(0, 4)}`,
    status: o.status ?? 'PUBLISHED',
    originalPrice: 500000,
    discountPrice: 400000,
    images: [{ url: `https://img/${id}.jpg` }],
  },
});

function setup() {
  const cartItem = {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn((args: unknown) => Promise.resolve(args)),
    update: vi.fn((args: unknown) => Promise.resolve(args)),
    deleteMany: vi.fn(),
  };
  const prisma = {
    cart: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: CART }),
    },
    cartItem,
    productVariant: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma, service: new CartService(prisma as unknown as PrismaService) };
}

/** Make `get()` return these rows. */
const stored = (prisma: ReturnType<typeof setup>['prisma'], rows: { quantity: number; v: ReturnType<typeof variant> }[]) =>
  prisma.cart.findUnique.mockResolvedValue({
    id: CART,
    items: rows.map((r, i) => ({ id: `row${i}`, quantity: r.quantity, variant: r.v })),
  });

describe('CartService', () => {
  describe('get', () => {
    it('is empty when the customer has no cart yet', async () => {
      const { service } = setup();
      await expect(service.get(USER)).resolves.toEqual({ items: [], itemCount: 0, subtotal: 0 });
    });

    it('prices lines live and flags problems; only buyable lines count towards totals', async () => {
      const { prisma, service } = setup();
      stored(prisma, [
        { quantity: 2, v: variant(V1) }, // fine: 2 × 4000.00
        { quantity: 1, v: variant(V2, { stock: 0 }) }, // out of stock
        { quantity: 1, v: variant(V3, { status: 'UNPUBLISHED' }) }, // off sale
      ]);
      const cart = await service.get(USER);
      expect(cart.items.map((l) => l.issue)).toEqual([null, 'OUT_OF_STOCK', 'UNAVAILABLE']);
      expect(cart.items[0]).toMatchObject({ price: 400000, compareAtPrice: 500000, quantity: 2, available: 5 });
      expect(cart.itemCount).toBe(2);
      expect(cart.subtotal).toBe(800000);
    });

    it('lowers a line to what is left, saves it, and says so once', async () => {
      const { prisma, service } = setup();
      stored(prisma, [{ quantity: 4, v: variant(V1, { stock: 5, reserved: 3 }) }]); // 2 left
      const cart = await service.get(USER);
      expect(cart.items[0]).toMatchObject({ quantity: 2, available: 2, issue: 'QUANTITY_REDUCED' });
      expect(prisma.cartItem.update).toHaveBeenCalledWith({ where: { id: 'row0' }, data: { quantity: 2 } });
      expect(cart.subtotal).toBe(800000);
    });

    it('uses a size price override like the product page does', async () => {
      const { prisma, service } = setup();
      stored(prisma, [{ quantity: 1, v: variant(V1, { override: 450000 }) }]);
      const { items } = await service.get(USER);
      expect(items[0]).toMatchObject({ price: 450000, compareAtPrice: 500000 });
    });
  });

  describe('setQuantity', () => {
    it('adds a new line capped at stock (and at most 10)', async () => {
      const { prisma, service } = setup();
      prisma.productVariant.findUnique.mockResolvedValue(variant(V1, { stock: 3 }));
      await service.setQuantity(USER, V1, 5);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: { cartId_variantId: { cartId: CART, variantId: V1 } },
        create: { cartId: CART, variantId: V1, productId: 'p-3333', quantity: 3 },
        update: { quantity: 3 },
      });
    });

    it('setting the same quantity twice gives the same result (it sets, never adds)', async () => {
      const { prisma, service } = setup();
      prisma.productVariant.findUnique.mockResolvedValue(variant(V1));
      await service.setQuantity(USER, V1, 2);
      await service.setQuantity(USER, V1, 2);
      const calls = prisma.cartItem.upsert.mock.calls.map((c) => (c[0] as { update: unknown }).update);
      expect(calls).toEqual([{ quantity: 2 }, { quantity: 2 }]);
    });

    it('0 removes the line, only from the caller’s own cart', async () => {
      const { prisma, service } = setup();
      await service.setQuantity(USER, V1, 0);
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { variantId: V1, cart: { userId: USER } } });
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('404s for an unpublished product or inactive size', async () => {
      const { prisma, service } = setup();
      prisma.productVariant.findUnique.mockResolvedValue(variant(V1, { status: 'DRAFT' }));
      await expect(service.setQuantity(USER, V1, 1)).rejects.toBeInstanceOf(NotFoundException);
      prisma.productVariant.findUnique.mockResolvedValue(variant(V1, { active: false }));
      await expect(service.setQuantity(USER, V1, 1)).rejects.toBeInstanceOf(NotFoundException);
      prisma.productVariant.findUnique.mockResolvedValue(null);
      await expect(service.setQuantity(USER, V1, 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400s when sold out', async () => {
      const { prisma, service } = setup();
      prisma.productVariant.findUnique.mockResolvedValue(variant(V1, { stock: 2, reserved: 2 }));
      await expect(service.setQuantity(USER, V1, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a new line when the cart is full, but still updates existing lines', async () => {
      const { prisma, service } = setup();
      prisma.productVariant.findUnique.mockResolvedValue(variant(V1));
      prisma.cartItem.count.mockResolvedValue(MAX_CART_LINES);
      await expect(service.setQuantity(USER, V1, 1)).rejects.toBeInstanceOf(BadRequestException);

      prisma.cartItem.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.setQuantity(USER, V1, 2)).resolves.toBeDefined();
    });
  });

  describe('merge', () => {
    it('adds quantities for sizes in both carts, caps at stock, skips sold-out/off-sale', async () => {
      const { prisma, service } = setup();
      prisma.productVariant.findMany.mockResolvedValue([
        variant(V1, { stock: 4 }),
        variant(V2, { stock: 0 }),
        variant(V3, { status: 'UNPUBLISHED' }),
      ]);
      prisma.cartItem.findMany.mockResolvedValue([{ variantId: V1, quantity: 3 }]);

      await service.merge(USER, [
        { variantId: V1, quantity: 2 },
        { variantId: V2, quantity: 1 },
        { variantId: V3, quantity: 1 },
      ]);

      expect(prisma.cartItem.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: 4 }, create: expect.objectContaining({ variantId: V1, quantity: 4 }) }),
      );
    });

    it('combines duplicate guest lines before merging', async () => {
      const { prisma, service } = setup();
      prisma.productVariant.findMany.mockResolvedValue([variant(V1)]);
      await service.merge(USER, [
        { variantId: V1, quantity: 1 },
        { variantId: V1, quantity: 2 },
      ]);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { quantity: 3 } }));
    });

    it('does not add new lines past the cart limit', async () => {
      const { prisma, service } = setup();
      prisma.productVariant.findMany.mockResolvedValue([variant(V1)]);
      prisma.cartItem.findMany.mockResolvedValue(
        Array.from({ length: MAX_CART_LINES }, (_, i) => ({ variantId: `other-${i}`, quantity: 1 })),
      );
      await service.merge(USER, [{ variantId: V1, quantity: 1 }]);
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('prices a guest cart without saving, keeps order, drops sizes that no longer exist', async () => {
      const { prisma, service } = setup();
      prisma.productVariant.findMany.mockResolvedValue([variant(V2, { stock: 1 }), variant(V1)]);
      const cart = await service.preview([
        { variantId: V1, quantity: 1 },
        { variantId: V3, quantity: 1 }, // deleted
        { variantId: V2, quantity: 3 },
      ]);
      expect(cart.items.map((l) => [l.variantId, l.quantity, l.issue])).toEqual([
        [V1, 1, null],
        [V2, 1, 'QUANTITY_REDUCED'],
      ]);
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
      expect(prisma.cart.upsert).not.toHaveBeenCalled();
    });
  });
});
