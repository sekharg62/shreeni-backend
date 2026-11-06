import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { UpdateActiveStatusDto } from '../../common/dto/common-body.dto.js';
import { ProductVariantsService } from './product-variants.service.js';
import {
  CreateProductVariantDto,
  ReplaceProductVariantDto,
  UpdateProductVariantDto,
} from './dto/product-variant.dto.js';

@ApiTags('Admin · Product variants')
@AdminOnly()
@Controller('admin/products/:productId/variants')
export class ProductVariantsController {
  constructor(private readonly variants: ProductVariantsService) {}

  @Get()
  findAll(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.variants.findAll(productId);
  }

  @Get(':id')
  findOne(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.variants.findOne(productId, id);
  }

  @Post()
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.variants.create(productId, dto);
  }

  @Put(':id')
  replace(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceProductVariantDto,
  ) {
    return this.variants.replace(productId, id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActiveStatusDto,
  ) {
    return this.variants.setActive(productId, id, dto.isActive);
  }

  @Patch(':id')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.variants.update(productId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.variants.remove(productId, id);
  }
}
