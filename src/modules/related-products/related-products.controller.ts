import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { RelatedProductsService } from './related-products.service.js';
import { LinkRelatedProductDto, SetRelatedProductsDto } from './dto/related-product.dto.js';

/** "You may also like" products. Every route returns the current list. */
@ApiTags('Admin · Related products')
@AdminOnly()
@Controller('admin/products/:productId/related')
export class RelatedProductsController {
  constructor(private readonly related: RelatedProductsService) {}

  @Get()
  findAll(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.related.findAll(productId);
  }

  @Post()
  link(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: LinkRelatedProductDto,
  ) {
    return this.related.link(productId, dto.relatedProductId);
  }

  @Put()
  set(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetRelatedProductsDto,
  ) {
    return this.related.set(productId, dto.relatedProductIds);
  }

  @Delete(':relatedProductId')
  unlink(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('relatedProductId', ParseUUIDPipe) relatedProductId: string,
  ) {
    return this.related.unlink(productId, relatedProductId);
  }
}
