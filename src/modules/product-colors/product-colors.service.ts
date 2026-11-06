import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assertDistinct, ensureIds, ensureProduct } from '../../common/utils/catalog-checks.js';
import type { SetProductColorsDto } from './dto/product-colors.dto.js';

@Injectable()
export class ProductColorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: string) {
    await ensureProduct(this.prisma, productId);
    return this.list(productId);
  }

  /** Sets primary (+ optional secondary) color, replacing whatever was there. */
  async set(productId: string, dto: SetProductColorsDto) {
    await ensureProduct(this.prisma, productId);
    const ids = [dto.primaryColorId, dto.secondaryColorId].filter(Boolean) as string[];
    assertDistinct(ids, 'Primary and secondary color must differ');
    await ensureIds(this.prisma.color, ids, 'Color');

    await this.prisma.$transaction([
      this.prisma.productColor.deleteMany({ where: { productId } }),
      this.prisma.productColor.createMany({
        data: [
          { productId, colorId: dto.primaryColorId, colorType: 'PRIMARY' as const },
          ...(dto.secondaryColorId
            ? [{ productId, colorId: dto.secondaryColorId, colorType: 'SECONDARY' as const }]
            : []),
        ],
      }),
    ]);
    return this.list(productId);
  }

  async clear(productId: string) {
    await ensureProduct(this.prisma, productId);
    await this.prisma.productColor.deleteMany({ where: { productId } });
    return this.list(productId);
  }

  /** { primary: Color | null, secondary: Color | null } */
  private async list(productId: string) {
    const rows = await this.prisma.productColor.findMany({
      where: { productId },
      include: { color: true },
    });
    return {
      primary: rows.find((r) => r.colorType === 'PRIMARY')?.color ?? null,
      secondary: rows.find((r) => r.colorType === 'SECONDARY')?.color ?? null,
    };
  }
}
