import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { slugify } from '../../common/utils/catalog.js';
import { pageArgs, paginated } from '../../common/utils/pagination.js';
import { CARD_SELECT, toCard } from '../products/public-products.service.js';
import {
  analyzeContent,
  internalTargets,
  isDoc,
  renderContent,
  type InternalType,
  type JNode,
} from './journal-content.js';
import type {
  CreateJournalPostDto,
  JournalAuthorDto,
  JournalCategoryDto,
  JournalPostQueryDto,
  PublicJournalQueryDto,
  UpdateJournalAuthorDto,
  UpdateJournalCategoryDto,
  UpdateJournalPostDto,
} from './dto/journal.dto.js';

/** A post is live when published and its publish time has come (a future date = scheduled). */
const live = (now = new Date()): Prisma.JournalPostWhereInput => ({ status: 'PUBLISHED', publishedAt: { lte: now } });

const CARD = {
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  coverAlt: true,
  publishedAt: true,
  updatedAt: true,
  readingMinutes: true,
  isFeatured: true,
  category: { select: { name: true, slug: true } },
  author: { select: { name: true, slug: true, avatarUrl: true } },
} satisfies Prisma.JournalPostSelect;

const ADMIN_LIST = {
  id: true,
  slug: true,
  title: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  coverImageUrl: true,
  isFeatured: true,
  wordCount: true,
  author: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
} satisfies Prisma.JournalPostSelect;

/** What the admin sees for a post's state. */
function stateOf(p: { status: string; publishedAt: Date | null }, now = new Date()) {
  if (p.status === 'PUBLISHED') return p.publishedAt && p.publishedAt > now ? 'scheduled' : 'published';
  return p.status === 'ARCHIVED' ? 'archived' : 'draft';
}

const SITE_PAGE = /^\/(?!\/)[^\s]*$/;

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  /* ═════════════════════════════ Admin: posts ═════════════════════════════ */

  async listPosts(q: JournalPostQueryDto) {
    const now = new Date();
    const where: Prisma.JournalPostWhereInput = {
      ...(q.search && { title: { contains: q.search, mode: 'insensitive' } }),
      ...(q.categoryId && { categoryId: q.categoryId }),
      ...(q.authorId && { authorId: q.authorId }),
      ...(q.status === 'draft' && { status: 'DRAFT' }),
      ...(q.status === 'archived' && { status: 'ARCHIVED' }),
      ...(q.status === 'published' && live(now)),
      ...(q.status === 'scheduled' && { status: 'PUBLISHED', publishedAt: { gt: now } }),
    };
    const [rows, total, counts] = await this.prisma.$transaction([
      this.prisma.journalPost.findMany({ where, orderBy: { updatedAt: 'desc' }, select: ADMIN_LIST, ...pageArgs(q.page, q.limit) }),
      this.prisma.journalPost.count({ where }),
      this.prisma.journalPost.findMany({ select: { status: true, publishedAt: true } }),
    ]);
    const tally = { all: counts.length, draft: 0, scheduled: 0, published: 0, archived: 0 };
    for (const c of counts) tally[stateOf(c, now)] += 1;
    return { ...paginated(rows.map((r) => ({ ...r, state: stateOf(r, now) })), total, q.page, q.limit), counts: tally };
  }

  /** One post for the editor, with its links out (and which are broken) and the posts linking to it. */
  async getPost(id: string) {
    const post = await this.prisma.journalPost.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { name: true } } } },
        products: {
          orderBy: { sortOrder: 'asc' },
          select: { product: { select: { id: true, name: true, status: true, images: { take: 1, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], select: { url: true } } } } },
        },
        links: { orderBy: { id: 'asc' } },
        inboundLinks: { select: { anchorText: true, post: { select: { id: true, title: true, slug: true, status: true, publishedAt: true } } } },
        slugRedirects: { select: { oldSlug: true } },
      },
    });
    if (!post) throw new NotFoundException(`Journal post ${id} not found`);

    // Which internal links point at something that's gone or not public.
    const doc = post.content as JNode;
    const resolved = isDoc(doc) ? await this.internalUrls(doc) : null;
    const linksOut = post.links.map((l) => ({
      kind: l.kind,
      targetType: l.targetType,
      targetId: l.targetId,
      href: l.kind === 'INTERNAL' && resolved ? (resolved(l.targetType as InternalType, l.targetId, l.href) ?? l.href) : l.href,
      anchorText: l.anchorText,
      rel: l.rel,
      newTab: l.newTab,
      broken: l.kind === 'INTERNAL' && resolved ? resolved(l.targetType as InternalType, l.targetId, l.href) === null : false,
    }));

    const { inboundLinks, slugRedirects, tags, products } = post;
    const rest: Partial<typeof post> = { ...post };
    delete rest.links;
    delete rest.inboundLinks;
    delete rest.slugRedirects;
    delete rest.tags;
    delete rest.products;
    return {
      ...rest,
      state: stateOf(post),
      tags: tags.map((t) => t.tag.name),
      products: products.map((p) => ({ id: p.product.id, name: p.product.name, status: p.product.status, imageUrl: p.product.images[0]?.url ?? null })),
      linksOut,
      linkedFrom: inboundLinks.map((l) => ({ ...l.post, state: stateOf(l.post), anchorText: l.anchorText })),
      oldSlugs: slugRedirects.map((r) => r.oldSlug),
    };
  }

  createPost(dto: CreateJournalPostDto) {
    return this.savePost(null, dto);
  }

  updatePost(id: string, dto: UpdateJournalPostDto) {
    return this.savePost(id, dto);
  }

  async removePost(id: string) {
    await this.prisma.journalPost.findUniqueOrThrow({ where: { id }, select: { id: true } }).catch(() => {
      throw new NotFoundException(`Journal post ${id} not found`);
    });
    await this.prisma.journalPost.delete({ where: { id } });
    return { id };
  }

  /** Create or update: content analysis, slug, publish rules, tags, products, link index, slug redirects. */
  private async savePost(id: string | null, dto: UpdateJournalPostDto) {
    const current = id
      ? await this.prisma.journalPost.findUnique({
          where: { id },
          select: { id: true, slug: true, title: true, status: true, publishedAt: true, content: true, coverImageUrl: true, coverAlt: true },
        })
      : null;
    if (id && !current) throw new NotFoundException(`Journal post ${id} not found`);

    const title = dto.title ?? current?.title;
    if (!title) throw new BadRequestException('A title is required');
    const content = dto.content ?? (current?.content as JNode | undefined);
    if (!isDoc(content)) throw new BadRequestException('content must be an editor document ({ type: "doc", ... })');
    const analysis = analyzeContent(content);

    // Status & publish date: publishing without a date means "now"; a future date schedules it.
    const status = dto.status ?? current?.status ?? 'DRAFT';
    let publishedAt = dto.publishedAt !== undefined ? (dto.publishedAt ? new Date(dto.publishedAt) : null) : (current?.publishedAt ?? null);
    if (status === 'PUBLISHED') {
      if (!publishedAt) publishedAt = new Date();
      if (analysis.wordCount < 1) throw new BadRequestException('Add some text before publishing');
      const cover = dto.coverImageUrl !== undefined ? dto.coverImageUrl : current?.coverImageUrl;
      const alt = dto.coverAlt !== undefined ? dto.coverAlt : current?.coverAlt;
      if (cover && !alt) throw new BadRequestException('Describe the cover image (alt text) before publishing');
    }

    const slug = await this.uniqueSlug(dto.slug ?? (current ? current.slug : slugify(title)), id);
    const tagIds = dto.tags ? await this.tagIds(dto.tags) : undefined;
    if (dto.productIds?.length) {
      const found = await this.prisma.product.count({ where: { id: { in: dto.productIds } } });
      if (found !== dto.productIds.length) throw new BadRequestException('One or more products do not exist');
    }

    const data = {
      title,
      slug,
      ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
      content: content as Prisma.InputJsonValue,
      headings: analysis.headings as unknown as Prisma.InputJsonValue,
      wordCount: analysis.wordCount,
      readingMinutes: analysis.readingMinutes,
      ...(dto.coverImageUrl !== undefined && { coverImageUrl: dto.coverImageUrl }),
      ...(dto.coverAlt !== undefined && { coverAlt: dto.coverAlt }),
      status,
      publishedAt,
      ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
      ...(dto.seoTitle !== undefined && { seoTitle: dto.seoTitle }),
      ...(dto.seoDescription !== undefined && { seoDescription: dto.seoDescription }),
      ...(dto.focusKeyword !== undefined && { focusKeyword: dto.focusKeyword }),
      ...(dto.canonicalUrl !== undefined && { canonicalUrl: dto.canonicalUrl }),
      ...(dto.ogImageUrl !== undefined && { ogImageUrl: dto.ogImageUrl }),
      ...(dto.noindex !== undefined && { noindex: dto.noindex }),
      ...(dto.authorId !== undefined && { authorId: dto.authorId }),
      ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
    };

    // Link index: internal links to other Journal posts also feed their "linked from" list.
    const postTargets = analysis.links.filter((l) => l.targetType === 'POST' && l.targetId).map((l) => l.targetId!);
    const existingPosts = new Set(
      postTargets.length
        ? (await this.prisma.journalPost.findMany({ where: { id: { in: postTargets } }, select: { id: true } })).map((p) => p.id)
        : [],
    );

    const savedId = await this.prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.journalPost.update({ where: { id }, data, select: { id: true } })
        : await tx.journalPost.create({ data, select: { id: true } });
      const postId = saved.id;

      // Slug changed on a post that has been public: keep the old URL working (301).
      if (current && current.slug !== slug && current.publishedAt) {
        await tx.journalSlugRedirect.upsert({ where: { oldSlug: current.slug }, create: { oldSlug: current.slug, postId }, update: { postId } });
      }
      // The new slug is a real URL now, not a redirect.
      await tx.journalSlugRedirect.deleteMany({ where: { oldSlug: slug } });

      if (tagIds) {
        await tx.journalPostTag.deleteMany({ where: { postId } });
        if (tagIds.length) await tx.journalPostTag.createMany({ data: tagIds.map((tagId) => ({ postId, tagId })) });
      }
      if (dto.productIds) {
        await tx.journalPostProduct.deleteMany({ where: { postId } });
        if (dto.productIds.length) {
          await tx.journalPostProduct.createMany({ data: dto.productIds.map((productId, i) => ({ postId, productId, sortOrder: i })) });
        }
      }

      await tx.journalLink.deleteMany({ where: { postId } });
      if (analysis.links.length) {
        await tx.journalLink.createMany({
          data: analysis.links.map((l) => ({
            postId,
            kind: l.kind,
            targetType: l.targetType,
            targetId: l.targetId,
            targetPostId: l.targetType === 'POST' && l.targetId && l.targetId !== postId && existingPosts.has(l.targetId) ? l.targetId : null,
            href: l.href.slice(0, 2000),
            anchorText: l.anchorText,
            rel: l.rel,
            newTab: l.newTab,
          })),
        });
      }
      return postId;
    });

    return this.getPost(savedId);
  }

  /** "how-to-drape" → "how-to-drape-2" if taken by another post. */
  private async uniqueSlug(base: string, excludeId: string | null) {
    const root = slugify(base).slice(0, 110);
    for (let n = 1; n < 100; n++) {
      const candidate = n === 1 ? root : `${root}-${n}`;
      const taken = await this.prisma.journalPost.findFirst({
        where: { slug: candidate, ...(excludeId && { NOT: { id: excludeId } }) },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new ConflictException('Could not find a free URL for this title. Set the slug yourself.');
  }

  /** Tag names → ids, creating new tags. */
  private async tagIds(names: string[]) {
    const clean = [...new Map(names.map((n) => n.trim()).filter(Boolean).map((n) => [slugify(n), n])).entries()];
    const ids: string[] = [];
    for (const [slug, name] of clean) {
      const tag = await this.prisma.journalTag.upsert({ where: { slug }, create: { slug, name }, update: {}, select: { id: true } });
      ids.push(tag.id);
    }
    return ids;
  }

  /** For the editor's link picker: products, product categories and Journal posts matching `q`. */
  async linkTargets(q: string) {
    const contains = { contains: q.trim(), mode: 'insensitive' as const };
    const [products, categories, posts] = await Promise.all([
      this.prisma.product.findMany({ where: { name: contains }, take: 6, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, status: true } }),
      this.prisma.category.findMany({ where: { name: contains }, take: 4, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, status: true } }),
      this.prisma.journalPost.findMany({ where: { title: contains }, take: 6, orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, slug: true, status: true, publishedAt: true } }),
    ]);
    return [
      ...products.map((p) => ({ type: 'PRODUCT', id: p.id, title: p.name, path: `/products/${p.slug}`, live: p.status === 'PUBLISHED' })),
      ...categories.map((c) => ({ type: 'CATEGORY', id: c.id, title: c.name, path: `/sarees/${c.slug}`, live: c.status === 'PUBLISHED' })),
      ...posts.map((p) => ({ type: 'POST', id: p.id, title: p.title, path: `/journal/${p.slug}`, live: stateOf(p) === 'published' })),
    ];
  }

  async tagSuggestions(q?: string) {
    return this.prisma.journalTag.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      take: 20,
      orderBy: { name: 'asc' },
      select: { name: true, slug: true, _count: { select: { posts: true } } },
    });
  }

  /* ═════════════════════════════ Admin: categories & authors ═════════════════════════════ */

  listCategories() {
    return this.prisma.journalCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { posts: true } } } });
  }

  async createCategory(dto: JournalCategoryDto) {
    return this.prisma.journalCategory.create({ data: { ...dto, slug: await this.freeSlug('category', dto.slug ?? dto.name) } });
  }

  async updateCategory(id: string, dto: UpdateJournalCategoryDto) {
    await this.mustExist('category', id);
    return this.prisma.journalCategory.update({
      where: { id },
      data: { ...dto, ...(dto.slug !== undefined && { slug: await this.freeSlug('category', dto.slug, id) }) },
    });
  }

  async removeCategory(id: string) {
    await this.mustExist('category', id);
    await this.prisma.journalCategory.delete({ where: { id } }); // posts keep existing, uncategorised
    return { id };
  }

  listAuthors() {
    return this.prisma.journalAuthor.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { posts: true } } } });
  }

  async createAuthor(dto: JournalAuthorDto) {
    return this.prisma.journalAuthor.create({
      data: { ...dto, socialLinks: dto.socialLinks ?? undefined, slug: await this.freeSlug('author', dto.slug ?? dto.name) },
    });
  }

  async updateAuthor(id: string, dto: UpdateJournalAuthorDto) {
    await this.mustExist('author', id);
    return this.prisma.journalAuthor.update({
      where: { id },
      data: {
        ...dto,
        socialLinks: dto.socialLinks === undefined ? undefined : ((dto.socialLinks ?? {}) as Prisma.InputJsonValue),
        ...(dto.slug !== undefined && { slug: await this.freeSlug('author', dto.slug, id) }),
      },
    });
  }

  async removeAuthor(id: string) {
    await this.mustExist('author', id);
    await this.prisma.journalAuthor.delete({ where: { id } }); // posts keep existing, without a byline
    return { id };
  }

  private async mustExist(kind: 'category' | 'author', id: string) {
    const row =
      kind === 'category'
        ? await this.prisma.journalCategory.findUnique({ where: { id }, select: { id: true } })
        : await this.prisma.journalAuthor.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException(`Journal ${kind} ${id} not found`);
  }

  private async freeSlug(kind: 'category' | 'author', base: string, excludeId?: string) {
    const slug = slugify(base);
    const taken =
      kind === 'category'
        ? await this.prisma.journalCategory.findFirst({ where: { slug, ...(excludeId && { NOT: { id: excludeId } }) }, select: { id: true } })
        : await this.prisma.journalAuthor.findFirst({ where: { slug, ...(excludeId && { NOT: { id: excludeId } }) }, select: { id: true } });
    if (taken) throw new ConflictException(`Another ${kind} already uses the URL "${slug}"`);
    return slug;
  }

  /* ═════════════════════════════ Storefront ═════════════════════════════ */

  async publicList(q: PublicJournalQueryDto) {
    const where: Prisma.JournalPostWhereInput = {
      ...live(),
      ...(q.category && { category: { slug: q.category } }),
      ...(q.author && { author: { slug: q.author } }),
      ...(q.tag && { tags: { some: { tag: { slug: q.tag } } } }),
      ...(q.featured && { isFeatured: true }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.journalPost.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], select: CARD, ...pageArgs(q.page, q.limit) }),
      this.prisma.journalPost.count({ where }),
    ]);
    return paginated(rows, total, q.page, q.limit);
  }

  /** A live post by slug, or `{ redirectTo }` for an old slug. 404 otherwise. */
  async publicPost(slug: string) {
    const post = await this.prisma.journalPost.findFirst({
      where: { slug, ...live() },
      include: {
        author: { select: { name: true, slug: true, role: true, bio: true, avatarUrl: true, socialLinks: true } },
        category: { select: { id: true, name: true, slug: true } },
        tags: { select: { tag: { select: { name: true, slug: true } } } },
        products: { orderBy: { sortOrder: 'asc' }, select: { product: { select: { ...CARD_SELECT, status: true } } } },
      },
    });
    if (!post) {
      const moved = await this.prisma.journalSlugRedirect.findUnique({ where: { oldSlug: slug }, select: { post: { select: { slug: true, status: true, publishedAt: true } } } });
      if (moved && stateOf(moved.post) === 'published') return { redirectTo: moved.post.slug };
      throw new NotFoundException('Journal post not found');
    }

    const doc = post.content as JNode;
    const html = isDoc(doc) ? renderContent(doc, await this.internalUrls(doc)) : '';
    const firstParagraph = isDoc(doc) ? analyzeContent(doc).firstParagraph : '';
    const description = post.seoDescription ?? post.excerpt ?? (firstParagraph.length > 160 ? `${firstParagraph.slice(0, 157).trimEnd()}…` : firstParagraph);

    const related = await this.related(post.id, post.category?.id ?? null, post.tags.map((t) => t.tag.slug));
    const { products, tags, category } = post;
    const rest: Partial<typeof post> = { ...post };
    delete rest.content;
    delete rest.products;
    delete rest.tags;
    delete rest.category;
    return {
      ...rest,
      description,
      html,
      category: category && { name: category.name, slug: category.slug },
      tags: tags.map((t) => t.tag),
      products: products.filter((p) => p.product.status === 'PUBLISHED').map((p) => toCard(p.product)),
      related,
    };
  }

  /** Up to 3 live posts: same category first, then shared tags, then latest. */
  private async related(postId: string, categoryId: string | null, tagSlugs: string[]) {
    const base = { ...live(), NOT: { id: postId } };
    const picks: Prisma.JournalPostGetPayload<{ select: typeof CARD }>[] = [];
    const add = async (where: Prisma.JournalPostWhereInput) => {
      if (picks.length >= 3) return;
      const rows = await this.prisma.journalPost.findMany({
        where: { ...base, ...where, slug: { notIn: picks.map((p) => p.slug) } },
        orderBy: { publishedAt: 'desc' },
        take: 3 - picks.length,
        select: CARD,
      });
      picks.push(...rows);
    };
    if (categoryId) await add({ categoryId });
    if (tagSlugs.length) await add({ tags: { some: { tag: { slug: { in: tagSlugs } } } } });
    await add({});
    return picks;
  }

  async publicCategories() {
    const cats = await this.prisma.journalCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { name: true, slug: true, description: true, seoTitle: true, seoDescription: true, _count: { select: { posts: { where: live() } } } },
    });
    return cats.map(({ _count, ...c }) => ({ ...c, postCount: _count.posts }));
  }

  async publicCategory(slug: string) {
    const c = await this.prisma.journalCategory.findUnique({ where: { slug }, select: { name: true, slug: true, description: true, seoTitle: true, seoDescription: true } });
    if (!c) throw new NotFoundException('Journal category not found');
    return c;
  }

  async publicAuthor(slug: string) {
    const a = await this.prisma.journalAuthor.findUnique({ where: { slug }, select: { name: true, slug: true, role: true, bio: true, avatarUrl: true, socialLinks: true } });
    if (!a) throw new NotFoundException('Journal author not found');
    return a;
  }

  /** Every live post (sitemap + RSS). */
  feed() {
    return this.prisma.journalPost.findMany({
      where: live(),
      orderBy: { publishedAt: 'desc' },
      take: 1000,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        seoDescription: true,
        coverImageUrl: true,
        publishedAt: true,
        updatedAt: true,
        noindex: true,
        author: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
  }

  /** Current URLs for a document's internal links (only targets that are public right now). */
  private async internalUrls(doc: JNode) {
    const t = internalTargets(doc);
    const [products, categories, posts] = await Promise.all([
      t.PRODUCT.length ? this.prisma.product.findMany({ where: { id: { in: t.PRODUCT }, status: 'PUBLISHED' }, select: { id: true, slug: true } }) : [],
      t.CATEGORY.length ? this.prisma.category.findMany({ where: { id: { in: t.CATEGORY }, status: 'PUBLISHED' }, select: { id: true, slug: true } }) : [],
      t.POST.length ? this.prisma.journalPost.findMany({ where: { id: { in: t.POST }, ...live() }, select: { id: true, slug: true } }) : [],
    ]);
    const urls = new Map<string, string>([
      ...products.map((p) => [`PRODUCT:${p.id}`, `/products/${p.slug}`] as const),
      ...categories.map((c) => [`CATEGORY:${c.id}`, `/sarees/${c.slug}`] as const),
      ...posts.map((p) => [`POST:${p.id}`, `/journal/${p.slug}`] as const),
    ]);
    return (type: InternalType, id: string | null, href: string): string | null =>
      type === 'PAGE' ? (SITE_PAGE.test(href) ? href : null) : id ? (urls.get(`${type}:${id}`) ?? null) : null;
  }
}
