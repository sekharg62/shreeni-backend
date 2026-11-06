import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { ProductColorsService } from './product-colors.service.js';
import { SetProductColorsDto } from './dto/product-colors.dto.js';

/** Returns { primary, secondary } for the product. */
@ApiTags('Admin · Product colors')
@AdminOnly()
@Controller('admin/products/:productId/colors')
export class ProductColorsController {
  constructor(private readonly productColors: ProductColorsService) {}

  @Get()
  findAll(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.productColors.findAll(productId);
  }

  @Put()
  set(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: SetProductColorsDto) {
    return this.productColors.set(productId, dto);
  }

  @Delete()
  clear(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.productColors.clear(productId);
  }
}
