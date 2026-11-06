import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { ProductTagsService } from './product-tags.service.js';
import { LinkProductTagDto, SetProductTagsDto } from './dto/product-tag.dto.js';

/** Every route returns the product's current tags. */
@ApiTags('Admin · Product tags')
@AdminOnly()
@Controller('admin/products/:productId/tags')
export class ProductTagsController {
  constructor(private readonly productTags: ProductTagsService) {}

  @Get()
  findAll(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.productTags.findAll(productId);
  }

  @Post()
  link(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: LinkProductTagDto) {
    return this.productTags.link(productId, dto.tagId);
  }

  @Put()
  set(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: SetProductTagsDto) {
    return this.productTags.set(productId, dto.tagIds);
  }

  @Delete(':tagId')
  unlink(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ) {
    return this.productTags.unlink(productId, tagId);
  }
}
