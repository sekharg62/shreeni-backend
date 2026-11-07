import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import type {
  CreatePublicReviewDto,
  MyReviewDto,
  PublicReviewPageDto,
  PublicReviewQueryDto,
  ReviewSummaryDto,
} from './dto/public-review.dto.js';

/** "Priya Sen" → "Priya S." — first name plus last initial, for privacy. */
function publicName(firstName: string | null, lastName: string | null, email: string | null): string {
  const first = firstName?.trim() || email?.split('@')[0] || 'Customer';
  const initial = lastName?.trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

@Injectable()
export class PublicReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private async publishedProductId(slug: string): Promise<string> {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);
    return product.id;
  }

  /** Approved reviews (newest first) + rating summary of all approved reviews. */
  async list(slug: string, q: PublicReviewQueryDto): Promise<PublicReviewPageDto> {
    const productId = await this.publishedProductId(slug);
    const where = { productId, status: 'APPROVED' as const };

    const [rows, groups] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: { rating: true, title: true, body: true, reviewerName: true, createdAt: true },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where,
        orderBy: { rating: 'asc' },
        _count: { _all: true },
      }),
    ]);

    const distribution: ReviewSummaryDto['distribution'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let count = 0;
    let sum = 0;
    for (const g of groups) {
      const n = g._count._all;
      const key = String(g.rating) as keyof typeof distribution;
      if (key in distribution) distribution[key] = n;
      count += n;
      sum += g.rating * n;
    }
    const summary = { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, distribution };
    return { summary, ...paginated(rows, count, q.page, q.limit) };
  }

  /** The customer's own review of this product, or null. */
  async mine(slug: string, userId: string): Promise<MyReviewDto | null> {
    const productId = await this.publishedProductId(slug);
    return this.prisma.review.findFirst({
      where: { productId, userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, rating: true, title: true, body: true, createdAt: true },
    });
  }

  /** New review from a signed-in customer — always PENDING until an admin approves it. */
  async create(slug: string, userId: string, dto: CreatePublicReviewDto): Promise<MyReviewDto> {
    const productId = await this.publishedProductId(slug);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: 'CUSTOMER' },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!user) throw new UnauthorizedException('Please sign in again');

    const existing = await this.prisma.review.findFirst({
      where: { productId, userId },
      select: { id: true },
    });
    if (existing) throw new ConflictException("You've already reviewed this product.");

    return this.prisma.review.create({
      data: {
        productId,
        userId,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        reviewerName: publicName(user.firstName, user.lastName, user.email),
        reviewerEmail: user.email ?? '',
        status: 'PENDING',
      },
      select: { status: true, rating: true, title: true, body: true, createdAt: true },
    });
  }
}
