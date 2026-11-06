import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CatalogStatus } from '../../generated/prisma/enums.js';
import { reorderUpdates } from '../../common/utils/catalog.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import { S3StorageService } from '../s3-img-uploader/s3-storage.service.js';
import type {
  CreateBannerDto,
  QueryBannerDto,
  ReplaceBannerDto,
  UpdateBannerDto,
} from './dto/banner.dto.js';
import type { PublicBannerDto } from './dto/public-banner.dto.js';

/** A hero carousel never needs more than this. */
const MAX_PUBLIC_BANNERS = 20;

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
  ) {}

  async findAll(q: QueryBannerDto) {
    const where = {
      ...(q.search && { title: { contains: q.search, mode: 'insensitive' as const } }),
      ...(q.status && { status: q.status }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.banner.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortOrder },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.banner.count({ where }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  /** Storefront list: published only, admin order, display fields only. */
  findPublished(): Promise<PublicBannerDto[]> {
    return this.prisma.banner.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { title: true, subtitle: true, imageUrl: true, mobileImageUrl: true, linkUrl: true },
      take: MAX_PUBLIC_BANNERS,
    });
  }

  async findOne(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException(`Banner ${id} not found`);
    return banner;
  }

  create(dto: CreateBannerDto) {
    return this.prisma.banner.create({ data: dto });
  }

  async replace(id: string, dto: ReplaceBannerDto) {
    const current = await this.findOne(id);
    const updated = await this.prisma.banner.update({
      where: { id },
      data: {
        title: dto.title ?? null,
        subtitle: dto.subtitle ?? null,
        imageUrl: dto.imageUrl,
        mobileImageUrl: dto.mobileImageUrl ?? null,
        linkUrl: dto.linkUrl ?? null,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? 'DRAFT',
      },
    });
    await this.deleteReplacedImages(current, updated);
    return updated;
  }

  async update(id: string, dto: UpdateBannerDto) {
    const current = await this.findOne(id);
    const updated = await this.prisma.banner.update({ where: { id }, data: dto });
    await this.deleteReplacedImages(current, updated);
    return updated;
  }

  async setStatus(id: string, status: CatalogStatus) {
    await this.findOne(id);
    return this.prisma.banner.update({ where: { id }, data: { status } });
  }

  /** Set the carousel order: ids[0] shows first. */
  async reorder(ids: string[]) {
    const found = await this.prisma.banner.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new BadRequestException('One or more banner ids do not exist');
    }
    await this.prisma.$transaction(
      reorderUpdates(ids).map(({ id, sortOrder }) =>
        this.prisma.banner.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return this.prisma.banner.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async remove(id: string) {
    const banner = await this.findOne(id);
    const deleted = await this.prisma.banner.delete({ where: { id } });
    await this.storage.deleteManyByUrl([banner.imageUrl, banner.mobileImageUrl]);
    return deleted;
  }

  /** Delete the stored image files that an update replaced or cleared. */
  private async deleteReplacedImages(
    before: { imageUrl: string; mobileImageUrl: string | null },
    after: { imageUrl: string; mobileImageUrl: string | null },
  ) {
    await this.storage.deleteManyByUrl([
      before.imageUrl !== after.imageUrl ? before.imageUrl : null,
      before.mobileImageUrl !== after.mobileImageUrl ? before.mobileImageUrl : null,
    ]);
  }
}
