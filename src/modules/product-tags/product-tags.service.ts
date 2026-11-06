import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ensureIds, ensureProduct } from '../../common/utils/catalog-checks.js';

@Injectable()
export class ProductTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: string) {
    await ensureProduct(this.prisma, productId);
    return this.list(productId);
  }

  /** Idempotent: linking an already-linked tag is a no-op. */
  async link(productId: string, tagId: string) {
    await ensureProduct(this.prisma, productId);
    await ensureIds(this.prisma.tag, [tagId], 'Tag');
    await this.prisma.productTag.createMany({
      data: [{ productId, tagId }],
      skipDuplicates: true,
    });
    return this.list(productId);
  }

  async set(productId: string, tagIds: string[]) {
    await ensureProduct(this.prisma, productId);
    await ensureIds(this.prisma.tag, tagIds, 'Tag');
    await this.prisma.$transaction([
      this.prisma.productTag.deleteMany({ where: { productId, tagId: { notIn: tagIds } } }),
      this.prisma.productTag.createMany({
        data: tagIds.map((tagId) => ({ productId, tagId })),
        skipDuplicates: true,
      }),
    ]);
    return this.list(productId);
  }

  async unlink(productId: string, tagId: string) {
    await ensureProduct(this.prisma, productId);
    const { count } = await this.prisma.productTag.deleteMany({ where: { productId, tagId } });
    if (count === 0) throw new NotFoundException(`Tag ${tagId} is not linked to this product`);
    return this.list(productId);
  }

  private async list(productId: string) {
    const links = await this.prisma.productTag.findMany({
      where: { productId },
      include: { tag: true },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((l) => l.tag);
  }
}
