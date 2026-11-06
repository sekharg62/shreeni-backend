import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ensureProduct } from '../../common/utils/catalog-checks.js';
import type {
  CreateProductVariantDto,
  ReplaceProductVariantDto,
  UpdateProductVariantDto,
} from './dto/product-variant.dto.js';

@Injectable()
export class ProductVariantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: string) {
    await ensureProduct(this.prisma, productId);
    return this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(productId: string, id: string) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id, productId } });
    if (!variant) throw new NotFoundException(`Variant ${id} not found on product ${productId}`);
    return variant;
  }

  async create(productId: string, dto: CreateProductVariantDto) {
    await ensureProduct(this.prisma, productId);
    return this.prisma.productVariant.create({ data: { ...dto, productId } });
  }

  async replace(productId: string, id: string, dto: ReplaceProductVariantDto) {
    const current = await this.findOne(productId, id);
    const stock = dto.stock ?? 0;
    this.assertStock(stock, current.reservedStock);
    return this.prisma.productVariant.update({
      where: { id },
      data: {
        size: dto.size,
        sku: dto.sku,
        stock,
        priceOverride: dto.priceOverride ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(productId: string, id: string, dto: UpdateProductVariantDto) {
    const current = await this.findOne(productId, id);
    if (dto.stock !== undefined) this.assertStock(dto.stock, current.reservedStock);
    return this.prisma.productVariant.update({ where: { id }, data: dto });
  }

  async setActive(productId: string, id: string, isActive: boolean) {
    await this.findOne(productId, id);
    return this.prisma.productVariant.update({ where: { id }, data: { isActive } });
  }

  async remove(productId: string, id: string) {
    await this.findOne(productId, id);
    // Cart items drop the variant link; past OrderItems keep their snapshot (FK SetNull).
    return this.prisma.productVariant.delete({ where: { id } });
  }

  /** reservedStock is held by in-progress checkouts and can't be oversold. */
  private assertStock(stock: number, reservedStock: number) {
    if (stock < reservedStock) {
      throw new BadRequestException(
        `stock (${stock}) can't be lower than the ${reservedStock} unit(s) currently reserved in checkouts`,
      );
    }
  }
}
