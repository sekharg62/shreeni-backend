import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service.js';
import {
  CategoryChildrenQueryDto,
  CategorySlugParamDto,
  PublicCategoryCardPageDto,
  PublicCategoryDetailDto,
} from './dto/public-category.dto.js';

/** Storefront categories — no auth. */
@ApiTags('Storefront · Categories')
@Controller('categories')
export class PublicCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Published direct children of a category, in admin order, one page at a time (default 10). */
  @Get('children')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: PublicCategoryCardPageDto })
  @ApiNotFoundResponse({ description: 'No category with that slug' })
  children(@Query() q: CategoryChildrenQueryDto): Promise<PublicCategoryCardPageDto> {
    return this.categories.findPublishedChildren(q.slug, q.page, q.limit);
  }

  /** One published category (page header + breadcrumb). Declared after 'children'. */
  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: PublicCategoryDetailDto })
  @ApiNotFoundResponse({ description: 'No published category with that slug' })
  findOne(@Param() p: CategorySlugParamDto): Promise<PublicCategoryDetailDto> {
    return this.categories.findPublishedBySlug(p.slug);
  }
}
