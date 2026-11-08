import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CatalogStatus } from '../../generated/prisma/enums.js';
import { nextPublishedAt, slugify } from '../../common/utils/catalog.js';
import { assertDistinct, ensureIds } from '../../common/utils/catalog-checks.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import { S3StorageService } from '../s3-img-uploader/s3-storage.service.js';
import type {
  CreateProductDto,
  ProductCoreDto,
  QueryProductDto,
  ReplaceProductDto,
  UpdateProductDto,
} from './dto/product.dto.js';
import { derivedPrices } from './derived-prices.js';

/** Everything the admin product page needs. */
const PRODUCT_DETAIL_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: { orderBy: { createdAt: 'asc' as const } },
  specifications: { orderBy: [{ group: 'asc' as const }, { sortOrder: 'asc' as const }] },
  colors: { include: { color: true } },
  tags: { include: { tag: true } },
  collections: { include: { collection: { select: { id: true, name: true, slug: true } } } },
  relatedFrom: {
    include: { relatedProduct: { select: { id: true, name: true, slug: true, status: true } } },
  },
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
  ) {}

  async findAll(q: QueryProductDto) {
    const where = {
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' as const } },
          { variants: { some: { sku: { contains: q.search, mode: 'insensitive' as const } } } },
        ],
      }),
      ...(q.status && { status: q.status }),
      ...(q.categoryId && { categoryId: q.categoryId }),
      ...(q.gender && { gender: q.gender }),
      ...(q.isFeatured !== undefined && { isFeatured: q.isFeatured }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: {
          category: { select: { id: true, name: true } },
          images: { where: { isPrimary: true }, take: 1 },
          variants: { select: { id: true, size: true, sku: true, stock: true, reservedStock: true, isActive: true } },
          _count: { select: { images: true, variants: true, reviews: true } },
        },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_DETAIL_INCLUDE,
    });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  async create(dto: CreateProductDto) {
    const {
      images = [],
      variants = [],
      specifications = [],
      tagIds = [],
      collectionIds = [],
      colors,
      relatedProductIds = [],
      ...core
    } = dto;

    this.assertPrices(core.originalPrice, core.discountPrice);
    await this.assertCategory(core.categoryId);
    await ensureIds(this.prisma.tag, tagIds, 'Tag');
    await ensureIds(this.prisma.collection, collectionIds, 'Collection');
    await ensureIds(this.prisma.product, relatedProductIds, 'Related product');
    if (colors) {
      assertDistinct([colors.primaryColorId, colors.secondaryColorId], 'Primary and secondary color must differ');
      await ensureIds(this.prisma.color, [colors.primaryColorId, colors.secondaryColorId].filter(Boolean) as string[], 'Color');
    }
    assertDistinct(variants.map((v) => v.size.toLowerCase()), 'Each variant size must be unique');
    assertDistinct(variants.map((v) => v.sku.toLowerCase()), 'Each variant SKU must be unique');
    if (images.filter((i) => i.isPrimary).length > 1) {
      throw new BadRequestException('Only one image can be primary');
    }
    const hasPrimary = images.some((i) => i.isPrimary);

    const created = await this.prisma.product.create({
      data: {
        ...core,
        ...derivedPrices(core.originalPrice, core.discountPrice),
        slug: core.slug ?? slugify(core.name),
        publishedAt: core.status === 'PUBLISHED' ? new Date() : null,
        images: {
          create: images.map((img, i) => ({
            url: img.url,
            sortOrder: img.sortOrder ?? i,
            isPrimary: img.isPrimary ?? (!hasPrimary && i === 0),
          })),
        },
        variants: { create: variants },
        specifications: {
          create: specifications.map((s, i) => ({ ...s, sortOrder: s.sortOrder ?? i })),
        },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        collections: { create: collectionIds.map((collectionId) => ({ collectionId })) },
        colors: {
          create: colors
            ? [
                { colorId: colors.primaryColorId, colorType: 'PRIMARY' as const },
                ...(colors.secondaryColorId
                  ? [{ colorId: colors.secondaryColorId, colorType: 'SECONDARY' as const }]
                  : []),
              ]
            : [],
        },
        relatedFrom: {
          create: relatedProductIds.map((relatedProductId) => ({ relatedProductId })),
        },
      },
      select: { id: true },
    });
    return this.findOne(created.id);
  }

  async replace(id: string, dto: ReplaceProductDto) {
    const current = await this.findOne(id);
    this.assertPrices(dto.originalPrice, dto.discountPrice);
    if (dto.categoryId !== current.categoryId) await this.assertCategory(dto.categoryId);
    const status = dto.status ?? 'DRAFT';
    await this.prisma.product.update({
      where: { id },
      data: {
        ...this.coreDefaults(dto),
        status,
        publishedAt: nextPublishedAt(status, current.publishedAt),
      },
    });
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.findOne(id);
    const originalPrice = dto.originalPrice ?? current.originalPrice;
    const discountPrice = dto.discountPrice !== undefined ? dto.discountPrice : current.discountPrice;
    this.assertPrices(originalPrice, discountPrice);
    if (dto.categoryId && dto.categoryId !== current.categoryId) {
      await this.assertCategory(dto.categoryId);
    }
    await this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        ...derivedPrices(originalPrice, discountPrice),
        publishedAt: nextPublishedAt(dto.status, current.publishedAt),
      },
    });
    return this.findOne(id);
  }

  async setStatus(id: string, status: CatalogStatus) {
    const current = await this.prisma.product.findUnique({
      where: { id },
      select: { publishedAt: true },
    });
    if (!current) throw new NotFoundException(`Product ${id} not found`);
    return this.prisma.product.update({
      where: { id },
      data: { status, publishedAt: nextPublishedAt(status, current.publishedAt) },
    });
  }

  /**
   * Bulk status. publishedAt is stamped only for products published for the
   * first time (same rule as setStatus). Unknown ids are rejected up front.
   */
  async setManyStatus(ids: string[], status: CatalogStatus) {
    const found = await this.prisma.product.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new BadRequestException('One or more product ids do not exist');
    }
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.product.updateMany({ where: { id: { in: ids } }, data: { status } }),
      ...(status === 'PUBLISHED'
        ? [
            this.prisma.product.updateMany({
              where: { id: { in: ids }, publishedAt: null },
              data: { publishedAt: new Date() },
            }),
          ]
        : []),
    ]);
    return { updated: count, status };
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    // Images/variants/specs/links cascade; past OrderItems keep their snapshot (FK SetNull).
    const deleted = await this.prisma.product.delete({ where: { id } });
    // Then remove the product's image files from S3 (products/{id}/...).
    await this.storage.deleteManyByUrl(product.images.map((i) => i.url));
    return deleted;
  }

  /** PUT semantics: every optional core field not sent goes back to its default. */
  private coreDefaults(dto: ProductCoreDto) {
    return {
      name: dto.name,
      slug: dto.slug ?? slugify(dto.name),
      shortDescription: dto.shortDescription ?? null,
      description: dto.description,
      story: dto.story ?? null,
      categoryId: dto.categoryId,
      gender: dto.gender ?? 'WOMEN',
      fabric: dto.fabric ?? null,
      collectionName: dto.collectionName ?? null,
      originalPrice: dto.originalPrice,
      discountPrice: dto.discountPrice ?? null,
      ...derivedPrices(dto.originalPrice, dto.discountPrice),
      hsnCode: dto.hsnCode ?? null,
      gstRate: dto.gstRate ?? 5,
      lengthCm: dto.lengthCm ?? null,
      widthCm: dto.widthCm ?? null,
      blousePiece: dto.blousePiece ?? false,
      blousePieceInfo: dto.blousePieceInfo ?? null,
      washCare: dto.washCare ?? null,
      countryOfOrigin: dto.countryOfOrigin ?? null,
      manufacturedBy: dto.manufacturedBy ?? null,
      manufacturerAddress: dto.manufacturerAddress ?? null,
      isFeatured: dto.isFeatured ?? false,
      sortOrder: dto.sortOrder ?? 0,
    };
  }

  private assertPrices(originalPrice: number, discountPrice?: number | null) {
    if (discountPrice != null && discountPrice >= originalPrice) {
      throw new BadRequestException('discountPrice must be lower than originalPrice');
    }
  }

  private async assertCategory(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) throw new BadRequestException(`Category ${categoryId} not found`);
  }
}
