import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { slugify } from '../../common/utils/catalog.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import type {
  CreateCollectionDto,
  QueryCollectionDto,
  ReplaceCollectionDto,
  UpdateCollectionDto,
} from './dto/collection.dto.js';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: QueryCollectionDto) {
    const where = {
      ...(q.search && { name: { contains: q.search, mode: 'insensitive' as const } }),
      ...(q.isActive !== undefined && { isActive: q.isActive }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.collection.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: { _count: { select: { products: true } } },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.collection.count({ where }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  async findOne(id: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!collection) throw new NotFoundException(`Collection ${id} not found`);
    return collection;
  }

  create(dto: CreateCollectionDto) {
    return this.prisma.collection.create({
      data: { ...dto, slug: dto.slug ?? slugify(dto.name) },
    });
  }

  async replace(id: string, dto: ReplaceCollectionDto) {
    await this.findOne(id);
    return this.prisma.collection.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug ?? slugify(dto.name),
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCollectionDto) {
    await this.findOne(id);
    return this.prisma.collection.update({ where: { id }, data: dto });
  }

  async setActive(id: string, isActive: boolean) {
    await this.findOne(id);
    return this.prisma.collection.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.collection.delete({ where: { id } });
  }
}
