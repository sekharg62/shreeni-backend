import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PublicProductsService } from './public-products.service.js';
import { ProductSearchService } from './product-search.service.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { SearchQueryDto, SearchSuggestionsDto, SuggestQueryDto } from './dto/search.dto.js';
import {
  ProductFacetsDto,
  ProductSlugParamDto,
  PublicProductCardDto,
  PublicProductDetailDto,
  PublicProductFiltersDto,
  PublicProductPageDto,
  PublicProductQueryDto,
  RelatedProductsQueryDto,
} from './dto/public-product.dto.js';

const CACHE = 'public, max-age=60, stale-while-revalidate=300';

/** Storefront products — no auth. */
@ApiTags('Storefront · Products')
@Controller('products')
export class PublicProductsController {
  constructor(
    private readonly products: PublicProductsService,
    private readonly search_: ProductSearchService,
  ) {}

  /** Published products of a category (and its sub-categories), paginated. */
  @Get()
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({ type: PublicProductPageDto })
  @ApiNotFoundResponse({ description: 'No published category with that slug' })
  list(@Query() q: PublicProductQueryDto): Promise<PublicProductPageDto> {
    return this.products.findCards(q);
  }

  /** Full-text product search (typo tolerant), ranked by relevance or sorted. Declared before ':slug'. */
  @Get('search')
  @RateLimit(120, 60_000)
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({ type: PublicProductPageDto })
  search(@Query() q: SearchQueryDto): Promise<PublicProductPageDto> {
    return this.search_.search(q);
  }

  /** Search-as-you-type: matching categories and the top products. Declared before ':slug'. */
  @Get('suggest')
  @RateLimit(300, 60_000)
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  @ApiOkResponse({ type: SearchSuggestionsDto })
  suggest(@Query() q: SuggestQueryDto): Promise<SearchSuggestionsDto> {
    return this.search_.suggest(q.q);
  }

  /** Filter options (colours, tags, price, offers, stock) with counts. Declared before ':slug'. */
  @Get('facets')
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({ type: ProductFacetsDto })
  @ApiNotFoundResponse({ description: 'No published category with that slug' })
  facets(@Query() q: PublicProductFiltersDto): Promise<ProductFacetsDto> {
    return this.products.facets(q);
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
