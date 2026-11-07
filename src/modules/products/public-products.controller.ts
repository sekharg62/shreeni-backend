import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service.js';
import { PublicProductPageDto, PublicProductQueryDto } from './dto/public-product.dto.js';

/** Storefront products — no auth. */
@ApiTags('Storefront · Products')
@Controller('products')
export class PublicProductsController {
  constructor(private readonly products: ProductsService) {}

  /** Published products of a category (and its sub-categories), paginated. */
  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: PublicProductPageDto })
  @ApiNotFoundResponse({ description: 'No published category with that slug' })
  list(@Query() q: PublicProductQueryDto): Promise<PublicProductPageDto> {
    return this.products.findPublishedCards(q);
  }
}
