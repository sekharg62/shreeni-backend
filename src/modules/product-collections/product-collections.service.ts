import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ensureIds, ensureProduct } from '../../common/utils/catalog-checks.js';

@Injectable()
export class ProductCollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: string) {
    await ensureProduct(this.prisma, productId);
    return this.list(productId);
  }

  /** Idempotent: linking an already-linked collection is a no-op. */
  async link(productId: string, collectionId: string) {
    await ensureProduct(this.prisma, productId);
    await ensureIds(this.prisma.collection, [collectionId], 'Collection');
    await this.prisma.productCollection.createMany({
      data: [{ productId, collectionId }],
      skipDuplicates: true,
    });
    return this.list(productId);
  }

  async set(productId: string, collectionIds: string[]) {
    await ensureProduct(this.prisma, productId);
    await ensureIds(this.prisma.collection, collectionIds, 'Collection');
    await this.prisma.$transaction([
      this.prisma.productCollection.deleteMany({
        where: { productId, collectionId: { notIn: collectionIds } },
      }),
      this.prisma.productCollection.createMany({
        data: collectionIds.map((collectionId) => ({ productId, collectionId })),
        skipDuplicates: true,
      }),
    ]);
    return this.list(productId);
  }

  async unlink(productId: string, collectionId: string) {
    await ensureProduct(this.prisma, productId);
    const { count } = await this.prisma.productCollection.deleteMany({
      where: { productId, collectionId },
    });
    if (count === 0) {
      throw new NotFoundException(`Collection ${collectionId} is not linked to this product`);
    }
    return this.list(productId);
  }

  private async list(productId: string) {
    const links = await this.prisma.productCollection.findMany({
      where: { productId },
      include: { collection: true },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((l) => l.collection);
  }
}
