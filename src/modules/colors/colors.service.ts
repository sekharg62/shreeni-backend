import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import type {
  CreateColorDto,
  QueryColorDto,
  ReplaceColorDto,
  UpdateColorDto,
} from './dto/color.dto.js';

@Injectable()
export class ColorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: QueryColorDto) {
    const where = q.search
      ? { name: { contains: q.search, mode: 'insensitive' as const } }
      : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.color.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: { _count: { select: { products: true } } },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.color.count({ where }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  async findOne(id: string) {
    const color = await this.prisma.color.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!color) throw new NotFoundException(`Color ${id} not found`);
    return color;
  }

  create(dto: CreateColorDto) {
    return this.prisma.color.create({ data: dto });
  }

  async replace(id: string, dto: ReplaceColorDto) {
    await this.findOne(id);
    return this.prisma.color.update({
      where: { id },
      data: { name: dto.name, hexCode: dto.hexCode ?? null },
    });
  }

  async update(id: string, dto: UpdateColorDto) {
    await this.findOne(id);
    return this.prisma.color.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.color.delete({ where: { id } });
  }
}
