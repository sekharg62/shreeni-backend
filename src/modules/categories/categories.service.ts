/// <reference types="multer" />
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CatalogStatus, Gender } from '../../generated/prisma/enums.js';
import { nextPublishedAt, reorderUpdates, slugify } from '../../common/utils/catalog.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import { S3StorageService } from '../s3-img-uploader/s3-storage.service.js';
import { ImageUploadService } from '../s3-img-uploader/image-upload.service.js';
import { ImagePaths, MAX_WIDTH } from '../s3-img-uploader/image-paths.js';
import type {
  CreateCategoryDto,
  QueryCategoryDto,
  ReplaceCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';
import type { PublicCategoryCardDto } from './dto/public-category.dto.js';

export type TreeNode = {
  id: string;
  name: string;
  slug: string;
  status: CatalogStatus;
  sortOrder: number;
  gender: Gender | null;
  bannerUrl: string | null;
  posterUrl: string | null;
  productCount: number;
  children: TreeNode[];
};

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly uploads: ImageUploadService,
  ) {}

  async findAll(q: QueryCategoryDto) {
    const where = {
      ...(q.search && { name: { contains: q.search, mode: 'insensitive' as const } }),
      ...(q.status && { status: q.status }),
      ...(q.gender && { gender: q.gender }),
      ...(q.parentId === 'root' && { parentId: null }),
      ...(q.parentId && q.parentId !== 'root' && { parentId: q.parentId }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortOrder },
        include: {
          parent: { select: { id: true, name: true } },
          _count: { select: { products: true, children: true } },
        },
        ...pageArgs(q.page, q.limit),
      }),
      this.prisma.category.count({ where }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  /** Full nested tree (all statuses) for the admin category picker. */
  async tree(): Promise<TreeNode[]> {
    const all = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        sortOrder: true,
        parentId: true,
        gender: true,
        bannerUrl: true,
        posterUrl: true,
        _count: { select: { products: true } },
      },
    });
    const byId = new Map<string, TreeNode>();
    for (const { _count, parentId: _p, ...c } of all) {
      byId.set(c.id, { ...c, productCount: _count.products, children: [] });
    }
    const roots: TreeNode[] = [];
    for (const c of all) {
      const node = byId.get(c.id)!;
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    return roots;
  }

  /** Reorder siblings: every id must exist and share the same parent. */
  async reorder(ids: string[]) {
    const rows = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, parentId: true },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException('One or more category ids do not exist');
    }
    if (new Set(rows.map((r) => r.parentId)).size > 1) {
      throw new BadRequestException('Only categories with the same parent can be reordered together');
    }
    await this.prisma.$transaction(
      reorderUpdates(ids).map(({ id, sortOrder }) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return this.tree();
  }

  /**
   * Storefront: published direct children of the category with this slug.
   * One query, three columns per child. 404 when the slug doesn't exist.
   */
  async findPublishedChildren(slug: string): Promise<PublicCategoryCardDto[]> {
    const parent = await this.prisma.category.findUnique({
      where: { slug },
      select: {
        children: {
          where: { status: 'PUBLISHED' },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { name: true, slug: true, posterUrl: true },
        },
      },
    });
    if (!parent) throw new NotFoundException(`Category "${slug}" not found`);
    return parent.children;
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          select: { id: true, name: true, slug: true, status: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { products: true } },
      },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) await this.assertParentExists(dto.parentId);
    return this.prisma.category.create({
      data: {
        ...dto,
        slug: dto.slug ?? slugify(dto.name),
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : null,
      },
    });
  }

  async replace(id: string, dto: ReplaceCategoryDto) {
    const current = await this.findOne(id);
    await this.assertValidParent(id, dto.parentId ?? null);
    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug ?? slugify(dto.name),
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        gender: dto.gender ?? null,
        bannerUrl: dto.bannerUrl ?? null,
        posterUrl: dto.posterUrl ?? null,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? 'DRAFT',
        publishedAt: nextPublishedAt(dto.status ?? 'DRAFT', current.publishedAt),
      },
    });
    await this.deleteReplacedImages(current, updated);
    return updated;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.findOne(id);
    if (dto.parentId !== undefined) await this.assertValidParent(id, dto.parentId);
    const updated = await this.prisma.category.update({
      where: { id },
      data: { ...dto, publishedAt: nextPublishedAt(dto.status, current.publishedAt) },
    });
    await this.deleteReplacedImages(current, updated);
    return updated;
  }

  /**
   * Upload a banner or poster to categories/{id}/, save it on the category,
   * and delete the image it replaces.
   */
  async uploadImage(id: string, kind: 'banner' | 'poster', file: Express.Multer.File | undefined) {
    const current = await this.findOne(id);
    const key = kind === 'banner' ? ImagePaths.categoryBanner(id) : ImagePaths.categoryPoster(id);
    const uploaded = await this.uploads.uploadImage(file, key, MAX_WIDTH.category);
    const field = kind === 'banner' ? 'bannerUrl' : 'posterUrl';
    let updated;
    try {
      updated = await this.prisma.category.update({ where: { id }, data: { [field]: uploaded.url } });
    } catch (err) {
      await this.storage.deleteByUrl(uploaded.url);
      throw err;
    }
    await this.storage.deleteByUrl(current[field]);
    return updated;
  }

  /** Delete the stored banner/poster files that an update replaced or cleared. */
  private async deleteReplacedImages(
    before: { bannerUrl: string | null; posterUrl: string | null },
    after: { bannerUrl: string | null; posterUrl: string | null },
  ) {
    await this.storage.deleteManyByUrl([
      before.bannerUrl !== after.bannerUrl ? before.bannerUrl : null,
      before.posterUrl !== after.posterUrl ? before.posterUrl : null,
    ]);
  }

  async setStatus(id: string, status: CatalogStatus) {
    const current = await this.findOne(id);
    return this.prisma.category.update({
      where: { id },
      data: { status, publishedAt: nextPublishedAt(status, current.publishedAt) },
    });
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    const { products, children } = category._count;
    if (products > 0 || children > 0) {
      throw new ConflictException(
        `Cannot delete "${category.name}": it still has ${products} product(s) and ` +
          `${children} sub-categor${children === 1 ? 'y' : 'ies'}. Move them first, ` +
          'or set status to DISCONTINUED.',
      );
    }
    const deleted = await this.prisma.category.delete({ where: { id } });
    await this.storage.deleteManyByUrl([category.bannerUrl, category.posterUrl]);
    return deleted;
  }

  private async assertParentExists(parentId: string) {
    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new BadRequestException(`Parent category ${parentId} not found`);
  }

  /** Parent must exist and must not be the category itself or one of its descendants. */
  private async assertValidParent(id: string, parentId: string | null) {
    if (!parentId) return;
    if (parentId === id) throw new BadRequestException('A category cannot be its own parent');
    await this.assertParentExists(parentId);
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === id) {
        throw new BadRequestException('That parent is inside this category — it would create a loop');
      }
      const node: { parentId: string | null } | null =
        await this.prisma.category.findUnique({ where: { id: cursor }, select: { parentId: true } });
      cursor = node?.parentId ?? null;
    }
  }
}
