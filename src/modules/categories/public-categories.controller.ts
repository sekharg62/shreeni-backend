import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service.js';
import {
  CategoryChildrenQueryDto,
  PublicCategoryCardDto,
} from './dto/public-category.dto.js';

/** Storefront categories — no auth. */
@ApiTags('Storefront · Categories')
@Controller('categories')
export class PublicCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Published direct children of a category, in admin order. */
  @Get('children')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: PublicCategoryCardDto, isArray: true })
  @ApiNotFoundResponse({ description: 'No category with that slug' })
  children(@Query() q: CategoryChildrenQueryDto): Promise<PublicCategoryCardDto[]> {
    return this.categories.findPublishedChildren(q.slug);
  }
}
