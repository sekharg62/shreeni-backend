import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PublicProductsService } from './public-products.service.js';
import {
  ProductSlugParamDto,
  PublicProductCardDto,
  PublicProductDetailDto,
  PublicProductPageDto,
  PublicProductQueryDto,
  RelatedProductsQueryDto,
} from './dto/public-product.dto.js';

const CACHE = 'public, max-age=60, stale-while-revalidate=300';

/** Storefront products — no auth. */
@ApiTags('Storefront · Products')
@Controller('products')
export class PublicProductsController {
  constructor(private readonly products: PublicProductsService) {}

  /** Published products of a category (and its sub-categories), paginated. */
  @Get()
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({ type: PublicProductPageDto })
  @ApiNotFoundResponse({ description: 'No published category with that slug' })
  list(@Query() q: PublicProductQueryDto): Promise<PublicProductPageDto> {
    return this.products.findCards(q);
  }

  /** Related products, loaded after the main product. */
  @Get(':slug/related')
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({ type: PublicProductCardDto, isArray: true })
  @ApiNotFoundResponse({ description: 'No published product with that slug' })
  related(
    @Param() p: ProductSlugParamDto,
    @Query() q: RelatedProductsQueryDto,
  ): Promise<PublicProductCardDto[]> {
    return this.products.findRelated(p.slug, q.limit);
  }

  /** One published product: everything the product page needs except related. */
  @Get(':slug')
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({ type: PublicProductDetailDto })
  @ApiNotFoundResponse({ description: 'No published product with that slug' })
  findOne(@Param() p: ProductSlugParamDto): Promise<PublicProductDetailDto> {
    return this.products.findBySlug(p.slug);
  }
}
