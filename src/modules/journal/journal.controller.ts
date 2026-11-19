import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import {
  CreateJournalPostDto,
  JournalAuthorDto,
  JournalCategoryDto,
  JournalPostQueryDto,
  JournalSlugParamDto,
  LinkTargetQueryDto,
  PublicJournalQueryDto,
  UpdateJournalAuthorDto,
  UpdateJournalCategoryDto,
  UpdateJournalPostDto,
} from './dto/journal.dto.js';
import { JournalService } from './journal.service.js';

/** The Journal in the admin: posts, categories, authors, tags and the link picker. */
@ApiTags('Admin · Journal')
@AdminOnly()
@Controller('admin/journal')
export class AdminJournalController {
  constructor(private readonly journal: JournalService) {}

  @Get('posts')
  listPosts(@Query() q: JournalPostQueryDto) {
    return this.journal.listPosts(q);
  }

  @Get('posts/:id')
  getPost(@Param('id', ParseUUIDPipe) id: string) {
    return this.journal.getPost(id);
  }

  @Post('posts')
  createPost(@Body() dto: CreateJournalPostDto) {
    return this.journal.createPost(dto);
  }

  @Patch('posts/:id')
  updatePost(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJournalPostDto) {
    return this.journal.updatePost(id, dto);
  }

  @Delete('posts/:id')
  removePost(@Param('id', ParseUUIDPipe) id: string) {
    return this.journal.removePost(id);
  }

  /** Link picker: products, product categories and Journal posts matching ?q= */
  @Get('link-targets')
  linkTargets(@Query() q: LinkTargetQueryDto) {
    return this.journal.linkTargets(q.q);
  }

  @Get('tags')
  tags(@Query('q') q?: string) {
    return this.journal.tagSuggestions(q?.slice(0, 50));
  }

  @Get('categories')
  listCategories() {
    return this.journal.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: JournalCategoryDto) {
    return this.journal.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJournalCategoryDto) {
    return this.journal.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.journal.removeCategory(id);
  }

  @Get('authors')
  listAuthors() {
    return this.journal.listAuthors();
  }

  @Post('authors')
  createAuthor(@Body() dto: JournalAuthorDto) {
    return this.journal.createAuthor(dto);
  }

  @Patch('authors/:id')
  updateAuthor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJournalAuthorDto) {
    return this.journal.updateAuthor(id, dto);
  }

  @Delete('authors/:id')
  removeAuthor(@Param('id', ParseUUIDPipe) id: string) {
    return this.journal.removeAuthor(id);
  }
}

const CACHE = 'public, max-age=60, stale-while-revalidate=300';

/** The Journal on the storefront — no auth, live posts only. */
@ApiTags('Storefront · Journal')
@Controller('journal')
export class PublicJournalController {
  constructor(private readonly journal: JournalService) {}

  @Get('posts')
  @Header('Cache-Control', CACHE)
  list(@Query() q: PublicJournalQueryDto) {
    return this.journal.publicList(q);
  }

  /** A live post, or { redirectTo } when the slug was renamed (send a 301). */
  @Get('posts/:slug')
  @Header('Cache-Control', CACHE)
  @ApiNotFoundResponse()
  post(@Param() p: JournalSlugParamDto) {
    return this.journal.publicPost(p.slug);
  }

  @Get('categories')
  @Header('Cache-Control', CACHE)
  categories() {
    return this.journal.publicCategories();
  }

  @Get('categories/:slug')
  @Header('Cache-Control', CACHE)
  category(@Param() p: JournalSlugParamDto) {
    return this.journal.publicCategory(p.slug);
  }

  @Get('authors/:slug')
  @Header('Cache-Control', CACHE)
  author(@Param() p: JournalSlugParamDto) {
    return this.journal.publicAuthor(p.slug);
  }

  /** Every live post, for the sitemap and RSS. */
  @Get('feed')
  @Header('Cache-Control', CACHE)
  feed() {
    return this.journal.feed();
  }
}
