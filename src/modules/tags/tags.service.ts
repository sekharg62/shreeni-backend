import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { slugify } from '../../common/utils/catalog.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import type {
  CreateTagDto,
  QueryTagDto,
  ReplaceTagDto,
  UpdateTagDto,
} from './dto/tag.dto.js';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: QueryTagDto) {
    const where = q.search
      ? { name: { contains: q.search, mode: 'insensitive' as const } }
      : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.tag.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: { _count: { select: { products: true } } },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.tag.count({ where }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  async findOne(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!tag) throw new NotFoundException(`Tag ${id} not found`);
    return tag;
  }

  create(dto: CreateTagDto) {
    return this.prisma.tag.create({
      data: { name: dto.name, slug: dto.slug ?? slugify(dto.name), color: dto.color },
    });
  }

  async replace(id: string, dto: ReplaceTagDto) {
    await this.findOne(id);
    return this.prisma.tag.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug ?? slugify(dto.name),
        color: dto.color ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateTagDto) {
    await this.findOne(id);
    return this.prisma.tag.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.tag.delete({ where: { id } });
  }
}
