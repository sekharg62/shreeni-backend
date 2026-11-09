import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { MAX_WISHLIST_ITEMS } from './dto/wishlist.dto.js';
import { WishlistService } from './wishlist.service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const WISHLIST = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const P2 = '44444444-4444-4444-8444-444444444444';
const P3 = '55555555-5555-4555-8555-555555555555';

const row = (id: string) => ({
  product: { id, name: `Saree ${id.slice(0, 4)}`, slug: `saree-${id.slice(0, 4)}`, originalPrice: 500000, discountPrice: 400000, images: [{ url: `https://img/${id}.jpg` }], variants: [{ stock: 3, reservedStock: 1 }] },
});

function setup() {
  const prisma = {
    product: { findFirst: vi.fn(), findMany: vi.fn() },
    wishlist: { upsert: vi.fn().mockResolvedValue({ id: WISHLIST }) },
    wishlistItem: {
      findMany: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  };
  const service = new WishlistService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('WishlistService', () => {
  describe('list', () => {
    it('returns published products as cards, newest first, scoped to the user', async () => {
      const { prisma, service } = setup();
      prisma.wishlistItem.findMany.mockResolvedValue([row(P1)]);

      const cards = await service.list(USER);

      expect(prisma.wishlistItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { wishlist: { userId: USER }, product: { status: 'PUBLISHED' } },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(cards).toEqual([
        {
          id: P1,
          name: 'Saree 3333',
          slug: 'saree-3333',
          price: 400000,
          compareAtPrice: 500000,
          imageUrl: `https://img/${P1}.jpg`,
          hoverImageUrl: null,
          categoryName: null,
          inStock: true,
          fewLeft: 2, // stock 3 − 1 reserved
        },
      ]);
    });
  });

  describe('add', () => {
    it('404s for a missing or unpublished product', async () => {
      const { prisma, service } = setup();
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.add(USER, P1)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.wishlistItem.upsert).not.toHaveBeenCalled();
    });

    it('creates the wishlist on first save and adds the item', async () => {
      const { prisma, service } = setup();
      prisma.product.findFirst.mockResolvedValue({ id: P1 });
      await service.add(USER, P1);
      expect(prisma.wishlist.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER }, create: { userId: USER } }));
      expect(prisma.wishlistItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { wishlistId: WISHLIST, productId: P1 } }),
      );
    });

    it('does nothing when already saved, even at the limit', async () => {
      const { prisma, service } = setup();
      prisma.product.findFirst.mockResolvedValue({ id: P1 });
      prisma.wishlistItem.findUnique.mockResolvedValue({ id: 'x' });
      prisma.wishlistItem.count.mockResolvedValue(MAX_WISHLIST_ITEMS);
      await expect(service.add(USER, P1)).resolves.toBeUndefined();
      expect(prisma.wishlistItem.upsert).not.toHaveBeenCalled();
    });

    it('rejects a new item when the wishlist is full', async () => {
      const { prisma, service } = setup();
      prisma.product.findFirst.mockResolvedValue({ id: P1 });
      prisma.wishlistItem.count.mockResolvedValue(MAX_WISHLIST_ITEMS);
      await expect(service.add(USER, P1)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it("only deletes from the caller's own wishlist", async () => {
      const { prisma, service } = setup();
      await service.remove(USER, P1);
      expect(prisma.wishlistItem.deleteMany).toHaveBeenCalledWith({ where: { productId: P1, wishlist: { userId: USER } } });
    });
  });

  describe('merge', () => {
    it('adds only published, not-yet-saved ids, de-duplicated, then returns the list', async () => {
      const { prisma, service } = setup();
      prisma.product.findMany.mockResolvedValue([{ id: P1 }, { id: P2 }]); // P3 unpublished
      (prisma.wishlistItem.findMany as Mock)
        .mockResolvedValueOnce([{ productId: P1 }]) // already saved
        .mockResolvedValueOnce([row(P2), row(P1)]); // list() afterwards

      const cards = await service.merge(USER, [P1, P2, P2, P3]);

      expect(prisma.wishlistItem.createMany).toHaveBeenCalledWith({
        data: [{ wishlistId: WISHLIST, productId: P2 }],
        skipDuplicates: true,
      });
      expect(cards.map((c) => c.id)).toEqual([P2, P1]);
    });

    it('stops at the limit', async () => {
      const { prisma, service } = setup();
      prisma.product.findMany.mockResolvedValue([{ id: P1 }, { id: P2 }]);
      const full = Array.from({ length: MAX_WISHLIST_ITEMS - 1 }, (_, i) => ({ productId: `saved-${i}` }));
      (prisma.wishlistItem.findMany as Mock).mockResolvedValueOnce(full).mockResolvedValueOnce([]);

      await service.merge(USER, [P1, P2]);

      expect(prisma.wishlistItem.createMany).toHaveBeenCalledWith({
        data: [{ wishlistId: WISHLIST, productId: P1 }],
        skipDuplicates: true,
      });
    });

    it('with nothing to merge just returns the list without creating a wishlist', async () => {
      const { prisma, service } = setup();
      prisma.wishlistItem.findMany.mockResolvedValue([]);
      await service.merge(USER, []);
      expect(prisma.wishlist.upsert).not.toHaveBeenCalled();
      expect(prisma.wishlistItem.createMany).not.toHaveBeenCalled();
    });
  });
});
