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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { BulkCatalogStatusDto, UpdateCatalogStatusDto } from '../../common/dto/common-body.dto.js';
import { ProductsService } from './products.service.js';
import {
  CreateProductDto,
  QueryProductDto,
  ReplaceProductDto,
  UpdateProductDto,
} from './dto/product.dto.js';

@ApiTags('Admin · Products')
@AdminOnly()
@Controller('admin/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Query() query: QueryProductDto) {
    return this.products.findAll(query);
  }

  /** Bulk status change, e.g. publish or discontinue the selected products. */
  @Patch('status')
  setManyStatus(@Body() dto: BulkCatalogStatusDto) {
    return this.products.setManyStatus(dto.ids, dto.status);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findOne(id);
  }

  /** Create a product together with its images, variants, specs, tags, collections, colors. */
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Put(':id')
  replace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceProductDto) {
    return this.products.replace(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogStatusDto) {
    return this.products.setStatus(id, dto.status);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }
}
