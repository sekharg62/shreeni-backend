import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { S3StorageService } from './s3-storage.service.js';

/**
 * Deletes uploaded files that no record uses (e.g. a banner image uploaded
 * and then the form was cancelled). Files that ARE in use are refused —
 * delete them through their owning record so the database and S3 stay in sync.
 */
@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
  ) {}

  async discard(url: string) {
    const key = this.storage.keyFromUrl(url);
    if (!key) {
      throw new BadRequestException(
        `Only files in this store's bucket can be discarded (${this.storage.publicBaseUrl}/...).`,
      );
    }

    const usedBy = await this.findUsage(url);
    if (usedBy) {
      throw new ConflictException(
        `This image is still used by ${usedBy}. Remove it from there instead — ` +
          'that also deletes the file.',
      );
    }

    try {
      await this.storage.deleteKeyOrThrow(key);
    } catch (err) {
      this.logger.error(`Discard failed for ${key}: ${(err as Error).message}`);
      throw new BadGatewayException('Could not delete the file from storage. Please try again.');
    }
    // S3 deletes are idempotent: discarding an already-deleted file also succeeds.
    return { deleted: true, key };
  }

  /** Human-readable description of the first record using this URL, or null. */
  private async findUsage(url: string): Promise<string | null> {
    const [productImage, category, banner, review] = await Promise.all([
      this.prisma.productImage.findFirst({
        where: { url },
        select: { product: { select: { id: true, name: true } } },
      }),
      this.prisma.category.findFirst({
        where: { OR: [{ bannerUrl: url }, { posterUrl: url }] },
        select: { id: true, name: true, bannerUrl: true },
      }),
      this.prisma.banner.findFirst({
        where: { OR: [{ imageUrl: url }, { mobileImageUrl: url }] },
        select: { id: true, title: true },
      }),
      this.prisma.review.findFirst({
        where: { OR: [{ images: { has: url } }, { videos: { has: url } }] },
        select: { id: true, product: { select: { name: true } } },
      }),
    ]);

    if (productImage) {
      return `product "${productImage.product.name}" (${productImage.product.id}) — delete it via DELETE /admin/products/${productImage.product.id}/images/:imageId`;
    }
    if (category) {
      const field = category.bannerUrl === url ? 'banner' : 'poster';
      return `the ${field} of category "${category.name}" (${category.id})`;
    }
    if (banner) {
      return `homepage banner "${banner.title ?? 'untitled'}" (${banner.id})`;
    }
    if (review) {
      return `a customer review on "${review.product.name}" (${review.id})`;
    }
    return null;
  }
}
