import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reorderUpdates } from '../../common/utils/catalog.js';
import { CARD_SELECT, toCard } from '../products/public-products.service.js';
import type { CreateHomePickDto, HomePickDto, UpdateHomePickDto } from './dto/home-pick.dto.js';
import type { PublicHomePickDto } from './dto/public-home-pick.dto.js';
import { MAX_HOME_PICKS, hiddenReason } from './home-pick-visibility.js';

const toDate = (v?: string | null) => (v ? new Date(v) : null);

const ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

/** Admin list: card columns plus what's needed to explain why a pick is hidden. */
const ADMIN_SELECT = {
  id: true,
  badge: true,
  sortOrder: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  updatedAt: true,
  product: {
    select: {
      ...CARD_SELECT,
      status: true,
      category: { select: { name: true, status: true } },
    },
  },
} satisfies Prisma.HomePickSelect;

type AdminRow = Prisma.HomePickGetPayload<{ select: typeof ADMIN_SELECT }>;

@Injectable()
export class HomePicksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every pick in homepage order, each with whether it's live now (and why not). */
  async findAll(): Promise<HomePickDto[]> {
    const rows = await this.prisma.homePick.findMany({ orderBy: ORDER, select: ADMIN_SELECT });
    const now = new Date();
    return rows.map((r) => this.toAdmin(r, now));
  }

  async findOne(id: string): Promise<HomePickDto> {
    const row = await this.prisma.homePick.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!row) throw new NotFoundException(`Homepage pick ${id} not found`);
    return this.toAdmin(row, new Date());
  }

  /** Add a product at the end of the list. One pick per product. */
  async create(dto: CreateHomePickDto): Promise<HomePickDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException(`Product ${dto.productId} not found`);

    const [existing, count, last] = await Promise.all([
      this.prisma.homePick.findUnique({ where: { productId: dto.productId }, select: { id: true } }),
      this.prisma.homePick.count(),
      this.prisma.homePick.aggregate({ _max: { sortOrder: true } }),
    ]);
    if (existing) throw new ConflictException('This product is already in the homepage picks');
    if (count >= MAX_HOME_PICKS) {
      throw new BadRequestException(
        `The list is full (${MAX_HOME_PICKS} products). Remove one before adding another.`,
      );
    }
    this.assertWindow(dto.startsAt ?? null, dto.endsAt ?? null);

    const created = await this.prisma.homePick.create({
      data: {
        productId: dto.productId,
        badge: dto.badge ?? null,
        isActive: dto.isActive ?? true,
        startsAt: toDate(dto.startsAt),
        endsAt: toDate(dto.endsAt),
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    return this.findOne(created.id);
  }

  /** Badge, on/off and schedule. Fields left out stay as they are; null clears. */
  async update(id: string, dto: UpdateHomePickDto): Promise<HomePickDto> {
    const current = await this.prisma.homePick.findUnique({
      where: { id },
      select: { startsAt: true, endsAt: true },
    });
    if (!current) throw new NotFoundException(`Homepage pick ${id} not found`);
    this.assertWindow(
      dto.startsAt !== undefined ? dto.startsAt : current.startsAt,
      dto.endsAt !== undefined ? dto.endsAt : current.endsAt,
    );
    await this.prisma.homePick.update({
      where: { id },
      data: {
        ...(dto.badge !== undefined && { badge: dto.badge }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.startsAt !== undefined && { startsAt: toDate(dto.startsAt) }),
        ...(dto.endsAt !== undefined && { endsAt: toDate(dto.endsAt) }),
      },
    });
    return this.findOne(id);
  }

  /** Set the homepage order: ids[0] shows first. Returns the whole list, ordered. */
  async reorder(ids: string[]): Promise<HomePickDto[]> {
    const found = await this.prisma.homePick.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new BadRequestException('One or more homepage pick ids do not exist');
    }
    await this.prisma.$transaction(
      reorderUpdates(ids).map(({ id, sortOrder }) =>
        this.prisma.homePick.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return this.findAll();
  }

  /** Take a product off the list (the product itself is untouched). */
  async remove(id: string): Promise<{ id: string }> {
    const row = await this.prisma.homePick.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException(`Homepage pick ${id} not found`);
    await this.prisma.homePick.delete({ where: { id } });
    return { id };
  }

  /**
   * Storefront: live picks in admin order, as product cards with their badge.
   * Same rule as `hiddenReason`: on, inside its window, product + category published, in stock.
   */
  async findPublic(limit: number): Promise<PublicHomePickDto[]> {
    const now = new Date();
    const rows = await this.prisma.homePick.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
        product: { status: 'PUBLISHED', category: { status: 'PUBLISHED' } },
      },
      orderBy: ORDER,
      take: MAX_HOME_PICKS, // stock is checked below, so fetch the whole (small) list
      select: { badge: true, product: { select: CARD_SELECT } },
    });
    return rows
      .map((r) => ({ ...toCard(r.product), badge: r.badge }))
      .filter((c) => c.inStock)
      .slice(0, limit);
  }

  private assertWindow(startsAt: Date | string | null, endsAt: Date | string | null) {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new BadRequestException('The end date must be after the start date');
    }
  }

  private toAdmin(r: AdminRow, now: Date): HomePickDto {
    const { product, ...pick } = r;
    const card = toCard(product);
    return {
      ...pick,
      product: {
        id: card.id,
        name: card.name,
        slug: card.slug,
        status: product.status,
        categoryName: product.category.name,
        imageUrl: card.imageUrl,
        price: card.price,
        compareAtPrice: card.compareAtPrice,
        inStock: card.inStock,
      },
      hiddenReason: hiddenReason(
        {
          isActive: pick.isActive,
          startsAt: pick.startsAt,
          endsAt: pick.endsAt,
          productStatus: product.status,
          categoryStatus: product.category.status,
          inStock: card.inStock,
        },
        now,
      ),
    };
  }
}
