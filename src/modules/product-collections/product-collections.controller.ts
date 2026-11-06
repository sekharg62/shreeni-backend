import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { ProductCollectionsService } from './product-collections.service.js';
import {
  LinkProductCollectionDto,
  SetProductCollectionsDto,
} from './dto/product-collection.dto.js';

/** Every route returns the product's current collections. */
@ApiTags('Admin · Product collections')
@AdminOnly()
@Controller('admin/products/:productId/collections')
export class ProductCollectionsController {
  constructor(private readonly productCollections: ProductCollectionsService) {}

  @Get()
  findAll(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.productCollections.findAll(productId);
  }

  @Post()
  link(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: LinkProductCollectionDto,
  ) {
    return this.productCollections.link(productId, dto.collectionId);
  }

  @Put()
  set(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetProductCollectionsDto,
  ) {
    return this.productCollections.set(productId, dto.collectionIds);
  }

  @Delete(':collectionId')
  unlink(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('collectionId', ParseUUIDPipe) collectionId: string,
  ) {
    return this.productCollections.unlink(productId, collectionId);
  }
}
