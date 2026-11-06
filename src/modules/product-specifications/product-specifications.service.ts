import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { SpecGroup } from '../../generated/prisma/enums.js';
import { ensureProduct } from '../../common/utils/catalog-checks.js';
import type {
  CreateProductSpecificationDto,
  ReplaceProductSpecificationDto,
  UpdateProductSpecificationDto,
} from './dto/product-specification.dto.js';

@Injectable()
export class ProductSpecificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: string, group?: SpecGroup) {
    await ensureProduct(this.prisma, productId);
    return this.list(productId, group);
  }

  async create(productId: string, dto: CreateProductSpecificationDto) {
    await ensureProduct(this.prisma, productId);
    const last = await this.prisma.productSpecification.findFirst({
      where: { productId, group: dto.group },
      orderBy: { sortOrder: 'desc' },
    });
    return this.prisma.productSpecification.create({
      data: { ...dto, productId, sortOrder: dto.sortOrder ?? (last ? last.sortOrder + 1 : 0) },
    });
  }

  async replace(productId: string, id: string, dto: ReplaceProductSpecificationDto) {
    await this.getOwned(productId, id);
    return this.prisma.productSpecification.update({
      where: { id },
      data: { group: dto.group, label: dto.label, value: dto.value, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async update(productId: string, id: string, dto: UpdateProductSpecificationDto) {
    await this.getOwned(productId, id);
    return this.prisma.productSpecification.update({ where: { id }, data: dto });
  }

  /** ids = rows of this product in the new display order (index = sortOrder). */
  async reorder(productId: string, ids: string[]) {
    await ensureProduct(this.prisma, productId);
    const owned = await this.prisma.productSpecification.count({
      where: { productId, id: { in: ids } },
    });
    if (owned !== ids.length) {
      throw new BadRequestException('One or more ids are not specifications of this product');
    }
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.productSpecification.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.list(productId);
  }

  async remove(productId: string, id: string) {
    await this.getOwned(productId, id);
    return this.prisma.productSpecification.delete({ where: { id } });
  }

  private async getOwned(productId: string, id: string) {
    const spec = await this.prisma.productSpecification.findFirst({ where: { id, productId } });
    if (!spec) throw new NotFoundException(`Specification ${id} not found on product ${productId}`);
    return spec;
  }

  private list(productId: string, group?: SpecGroup) {
    return this.prisma.productSpecification.findMany({
      where: { productId, ...(group && { group }) },
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    });
  }
}
