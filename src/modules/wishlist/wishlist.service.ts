import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicProductCardDto } from '../products/dto/public-product.dto.js';
import { CARD_SELECT, toCard } from '../products/public-products.service.js';
import { MAX_WISHLIST_ITEMS } from './dto/wishlist.dto.js';

const FULL_MESSAGE = `Your wishlist can hold up to ${MAX_WISHLIST_ITEMS} items. Remove one to save another.`;

/** The signed-in customer's wishlist. Only published products are saved or shown. */
@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  /** Saved products as cards, most recently saved first. Unpublished products are hidden. */
  async list(userId: string): Promise<PublicProductCardDto[]> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { wishlist: { userId }, product: { status: 'PUBLISHED' } },
      orderBy: { createdAt: 'desc' },
      select: { product: { select: CARD_SELECT } },
    });
    return rows.map((r) => toCard(r.product));
  }

  /** Save a product. Saving one that is already saved does nothing. */
  async add(userId: string, productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const wishlistId = await this.wishlistId(userId);
    const [saved, count] = await Promise.all([
      this.prisma.wishlistItem.findUnique({
        where: { wishlistId_productId: { wishlistId, productId } },
        select: { id: true },
      }),
      this.prisma.wishlistItem.count({ where: { wishlistId } }),
    ]);
    if (saved) return;
    if (count >= MAX_WISHLIST_ITEMS) throw new BadRequestException(FULL_MESSAGE);

    // Upsert so two quick taps can't trip the unique constraint.
    await this.prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId, productId } },
      create: { wishlistId, productId },
      update: {},
    });
  }

  /** Remove a product. Removing one that isn't saved does nothing. */
  async remove(userId: string, productId: string): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { productId, wishlist: { userId } } });
  }

  /**
   * Add what a guest saved before signing in. Unknown or unpublished ids are skipped,
   * and only as many as fit under the limit are added. Returns the full list.
   */
  async merge(userId: string, productIds: string[]): Promise<PublicProductCardDto[]> {
    const wanted = [...new Set(productIds)];
    if (wanted.length > 0) {
      const wishlistId = await this.wishlistId(userId);
      const [published, saved] = await Promise.all([
        this.prisma.product.findMany({ where: { id: { in: wanted }, status: 'PUBLISHED' }, select: { id: true } }),
        this.prisma.wishlistItem.findMany({ where: { wishlistId }, select: { productId: true } }),
      ]);
      const publishedIds = new Set(published.map((p) => p.id));
      const savedIds = new Set(saved.map((s) => s.productId));
      const room = Math.max(0, MAX_WISHLIST_ITEMS - savedIds.size);
      const toAdd = wanted.filter((id) => publishedIds.has(id) && !savedIds.has(id)).slice(0, room);
      if (toAdd.length > 0) {
        await this.prisma.wishlistItem.createMany({
          data: toAdd.map((productId) => ({ wishlistId, productId })),
          skipDuplicates: true,
        });
      }
    }
    return this.list(userId);
  }

  /** The customer's wishlist row, created the first time they save something. */
  private async wishlistId(userId: string): Promise<string> {
    const wishlist = await this.prisma.wishlist.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    return wishlist.id;
  }
}
