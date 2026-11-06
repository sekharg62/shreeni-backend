import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ReviewStatus } from '../../generated/prisma/enums.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import type { QueryReviewDto } from './dto/review.dto.js';

const REVIEW_INCLUDE = {
  product: { select: { id: true, name: true, slug: true } },
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
};

/**
 * Admin moderation only. Reviews are written by customers (storefront API);
 * admins approve/reject or delete them but never author or edit them.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: QueryReviewDto) {
    const where = {
      ...(q.status && { status: q.status }),
      ...(q.productId && { productId: q.productId }),
      ...(q.rating && { rating: q.rating }),
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: 'insensitive' as const } },
          { body: { contains: q.search, mode: 'insensitive' as const } },
          { reviewerName: { contains: q.search, mode: 'insensitive' as const } },
          { reviewerEmail: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: REVIEW_INCLUDE,
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id }, include: REVIEW_INCLUDE });
    if (!review) throw new NotFoundException(`Review ${id} not found`);
    return review;
  }

  async setStatus(id: string, status: ReviewStatus) {
    await this.findOne(id);
    return this.prisma.review.update({ where: { id }, data: { status }, include: REVIEW_INCLUDE });
  }

  async counts() {
    const groups = await this.prisma.review.groupBy({ by: ['status'], _count: { _all: true } });
    const out = { PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: 0 };
    for (const g of groups) {
      out[g.status] = g._count._all;
      out.ALL += g._count._all;
    }
    return out;
  }

  /** Bulk moderation. Unknown ids are rejected so the admin isn't misled about what changed. */
  async setManyStatus(ids: string[], status: ReviewStatus) {
    const found = await this.prisma.review.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new BadRequestException('One or more review ids do not exist');
    }
    const { count } = await this.prisma.review.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return { updated: count, status };
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.review.delete({ where: { id } });
  }
}
