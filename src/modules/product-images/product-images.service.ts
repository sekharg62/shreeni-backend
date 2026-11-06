/// <reference types="multer" />
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ensureProduct } from '../../common/utils/catalog-checks.js';
import { S3StorageService } from '../s3-img-uploader/s3-storage.service.js';
import { ImageUploadService } from '../s3-img-uploader/image-upload.service.js';
import { ImagePaths, MAX_FILES_PER_REQUEST, MAX_WIDTH } from '../s3-img-uploader/image-paths.js';
import type {
  CreateProductImageDto,
  ReplaceProductImageDto,
  UpdateProductImageDto,
} from './dto/product-image.dto.js';

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly uploads: ImageUploadService,
  ) {}

  async findAll(productId: string) {
    await ensureProduct(this.prisma, productId);
    return this.list(productId);
  }

  async create(productId: string, dto: CreateProductImageDto) {
    await ensureProduct(this.prisma, productId);
    const [count, last] = await Promise.all([
      this.prisma.productImage.count({ where: { productId } }),
      this.prisma.productImage.findFirst({ where: { productId }, orderBy: { sortOrder: 'desc' } }),
    ]);
    // The first image of a product becomes primary automatically.
    const isPrimary = dto.isPrimary ?? count === 0;
    await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      }
      await tx.productImage.create({
        data: {
          productId,
          url: dto.url,
          sortOrder: dto.sortOrder ?? (last ? last.sortOrder + 1 : 0),
          isPrimary,
        },
      });
    });
    return this.list(productId);
  }

  /**
   * Upload 1–10 files to products/{productId}/ and add them to the gallery
   * (appended in the order sent; the first becomes primary if none is yet).
   */
  async uploadMany(productId: string, files: Express.Multer.File[] | undefined) {
    await ensureProduct(this.prisma, productId);
    if (files && files.length > MAX_FILES_PER_REQUEST) {
      throw new BadRequestException(`Upload at most ${MAX_FILES_PER_REQUEST} images at a time.`);
    }
    const uploaded = await this.uploads.uploadImages(
      files,
      () => ImagePaths.product(productId),
      MAX_WIDTH.product,
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        const [primaryCount, last] = await Promise.all([
          tx.productImage.count({ where: { productId, isPrimary: true } }),
          tx.productImage.findFirst({ where: { productId }, orderBy: { sortOrder: 'desc' } }),
        ]);
        const start = last ? last.sortOrder + 1 : 0;
        await tx.productImage.createMany({
          data: uploaded.map((u, i) => ({
            productId,
            url: u.url,
            sortOrder: start + i,
            isPrimary: primaryCount === 0 && i === 0,
          })),
        });
      });
    } catch (err) {
      // DB write failed: don't leave the just-uploaded files orphaned in S3.
      await this.storage.deleteManyByUrl(uploaded.map((u) => u.url));
      throw err;
    }
    return this.list(productId);
  }

  async replace(productId: string, id: string, dto: ReplaceProductImageDto) {
    const current = await this.getOwned(productId, id);
    await this.write(productId, id, {
      url: dto.url,
      sortOrder: dto.sortOrder ?? 0,
      isPrimary: dto.isPrimary ?? false,
    });
    if (dto.url !== current.url) await this.storage.deleteByUrl(current.url);
    return this.list(productId);
  }

  async update(productId: string, id: string, dto: UpdateProductImageDto) {
    const current = await this.getOwned(productId, id);
    await this.write(productId, id, dto);
    if (dto.url && dto.url !== current.url) await this.storage.deleteByUrl(current.url);
    return this.list(productId);
  }

  setPrimary(productId: string, id: string) {
    return this.update(productId, id, { isPrimary: true });
  }

  /** ids = every image of the product, in the new display order. */
  async reorder(productId: string, ids: string[]) {
    await ensureProduct(this.prisma, productId);
    const existing = await this.prisma.productImage.findMany({
      where: { productId },
      select: { id: true },
    });
    const current = new Set(existing.map((i) => i.id));
    if (ids.length !== current.size || ids.some((id) => !current.has(id))) {
      throw new BadRequestException("ids must list every one of this product's images exactly once");
    }
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.productImage.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.list(productId);
  }

  async remove(productId: string, id: string) {
    const image = await this.getOwned(productId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id } });
      if (image.isPrimary) await this.promoteFirst(tx, productId);
    });
    await this.storage.deleteByUrl(image.url);
    return this.list(productId);
  }

  // --- helpers --------------------------------------------------------------

  /** Applies a change while keeping exactly one primary image. */
  private async write(
    productId: string,
    id: string,
    data: { url?: string; sortOrder?: number; isPrimary?: boolean },
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (data.isPrimary === true) {
        await tx.productImage.updateMany({
          where: { productId, NOT: { id } },
          data: { isPrimary: false },
        });
      }
      await tx.productImage.update({ where: { id }, data });
      if (data.isPrimary === false) {
        const primary = await tx.productImage.count({ where: { productId, isPrimary: true } });
        if (primary === 0) await this.promoteFirst(tx, productId, id);
      }
    });
  }

  /** Make the first image (by sortOrder) primary, optionally skipping one. */
  private async promoteFirst(
    tx: Pick<PrismaService, 'productImage'>,
    productId: string,
    skipId?: string,
  ) {
    const next = await tx.productImage.findFirst({
      where: { productId, ...(skipId && { NOT: { id: skipId } }) },
      orderBy: { sortOrder: 'asc' },
    });
    if (next) {
      await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }

  private async getOwned(productId: string, id: string) {
    const image = await this.prisma.productImage.findFirst({ where: { id, productId } });
    if (!image) throw new NotFoundException(`Image ${id} not found on product ${productId}`);
    return image;
  }

  private list(productId: string) {
    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
