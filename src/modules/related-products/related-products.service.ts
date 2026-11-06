import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ensureIds, ensureProduct } from '../../common/utils/catalog-checks.js';

@Injectable()
export class RelatedProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: string) {
    await ensureProduct(this.prisma, productId);
    return this.list(productId);
  }

  /** Idempotent: linking an already-related product is a no-op. */
  async link(productId: string, relatedProductId: string) {
    await this.assertLinkable(productId, [relatedProductId]);
    await this.prisma.relatedProduct.createMany({
      data: [{ productId, relatedProductId }],
      skipDuplicates: true,
    });
    return this.list(productId);
  }

  async set(productId: string, relatedProductIds: string[]) {
    await this.assertLinkable(productId, relatedProductIds);
    await this.prisma.$transaction([
      this.prisma.relatedProduct.deleteMany({
        where: { productId, relatedProductId: { notIn: relatedProductIds } },
      }),
      this.prisma.relatedProduct.createMany({
        data: relatedProductIds.map((relatedProductId) => ({ productId, relatedProductId })),
        skipDuplicates: true,
      }),
    ]);
    return this.list(productId);
  }

  async unlink(productId: string, relatedProductId: string) {
    await ensureProduct(this.prisma, productId);
    const { count } = await this.prisma.relatedProduct.deleteMany({
      where: { productId, relatedProductId },
    });
    if (count === 0) {
      throw new NotFoundException(`Product ${relatedProductId} is not related to this product`);
    }
    return this.list(productId);
  }

  private async assertLinkable(productId: string, ids: string[]) {
    await ensureProduct(this.prisma, productId);
    if (ids.includes(productId)) {
      throw new BadRequestException('A product cannot be related to itself');
    }
    await ensureIds(this.prisma.product, ids, 'Related product');
  }

  private async list(productId: string) {
    const links = await this.prisma.relatedProduct.findMany({
      where: { productId },
      include: {
        relatedProduct: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            originalPrice: true,
            discountPrice: true,
            images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((l) => l.relatedProduct);
  }
}
