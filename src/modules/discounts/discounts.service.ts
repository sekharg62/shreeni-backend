import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DiscountType } from '../../generated/prisma/enums.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import type {
  CreateDiscountDto,
  QueryDiscountDto,
  ReplaceDiscountDto,
  UpdateDiscountDto,
} from './dto/discount.dto.js';

type DiscountRules = {
  type: DiscountType;
  value: number;
  maxDiscountAmount?: number | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
};

const toDate = (v?: string | null) => (v ? new Date(v) : null);

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: QueryDiscountDto) {
    const where = {
      ...(q.search && { code: { contains: q.search.toUpperCase() } }),
      ...(q.isActive !== undefined && { isActive: q.isActive }),
      ...(q.type && { type: q.type }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.discount.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: { _count: { select: { orders: true } } },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.discount.count({ where }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  async findOne(id: string) {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!discount) throw new NotFoundException(`Discount ${id} not found`);
    return discount;
  }

  create(dto: CreateDiscountDto) {
    this.assertRules(dto);
    return this.prisma.discount.create({
      data: { ...dto, startsAt: toDate(dto.startsAt), endsAt: toDate(dto.endsAt) },
    });
  }

  async replace(id: string, dto: ReplaceDiscountDto) {
    await this.findOne(id);
    this.assertRules(dto);
    return this.prisma.discount.update({
      where: { id },
      data: {
        code: dto.code,
        description: dto.description ?? null,
        type: dto.type,
        value: dto.value,
        maxDiscountAmount: dto.maxDiscountAmount ?? null,
        minOrderValue: dto.minOrderValue ?? null,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        startsAt: toDate(dto.startsAt),
        endsAt: toDate(dto.endsAt),
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateDiscountDto) {
    const current = await this.findOne(id);
    // Validate the merged result, so a PATCH can't break the rules.
    this.assertRules({
      type: dto.type ?? current.type,
      value: dto.value ?? current.value,
      maxDiscountAmount:
        dto.maxDiscountAmount !== undefined ? dto.maxDiscountAmount : current.maxDiscountAmount,
      startsAt: dto.startsAt !== undefined ? dto.startsAt : current.startsAt,
      endsAt: dto.endsAt !== undefined ? dto.endsAt : current.endsAt,
    });
    return this.prisma.discount.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startsAt !== undefined && { startsAt: toDate(dto.startsAt) }),
        ...(dto.endsAt !== undefined && { endsAt: toDate(dto.endsAt) }),
      },
    });
  }

  async setActive(id: string, isActive: boolean) {
    await this.findOne(id);
    return this.prisma.discount.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Orders keep discountCode + discountTotal (FK is SetNull), so history survives.
    return this.prisma.discount.delete({ where: { id } });
  }

  private assertRules(d: DiscountRules) {
    if (d.type === 'PERCENTAGE' && d.value > 100) {
      throw new BadRequestException('A PERCENTAGE discount value must be between 1 and 100');
    }
    if (d.type === 'FLAT' && d.maxDiscountAmount) {
      throw new BadRequestException(
        'maxDiscountAmount only applies to PERCENTAGE discounts — a FLAT value is already the cap',
      );
    }
    if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }
}
