import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { ReorderDto } from '../../common/dto/common-body.dto.js';
import { SpecGroup } from '../../generated/prisma/enums.js';
import { ProductSpecificationsService } from './product-specifications.service.js';
import {
  CreateProductSpecificationDto,
  ReplaceProductSpecificationDto,
  UpdateProductSpecificationDto,
} from './dto/product-specification.dto.js';

@ApiTags('Admin · Product specifications')
@AdminOnly()
@Controller('admin/products/:productId/specifications')
export class ProductSpecificationsController {
  constructor(private readonly specs: ProductSpecificationsService) {}

  @Get()
  @ApiQuery({ name: 'group', enum: SpecGroup, required: false })
  findAll(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('group', new ParseEnumPipe(SpecGroup, { optional: true })) group?: SpecGroup,
  ) {
    return this.specs.findAll(productId, group);
  }

  @Post()
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductSpecificationDto,
  ) {
    return this.specs.create(productId, dto);
  }

  @Patch('reorder')
  reorder(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: ReorderDto) {
    return this.specs.reorder(productId, dto.ids);
  }

  @Put(':id')
  replace(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceProductSpecificationDto,
  ) {
    return this.specs.replace(productId, id, dto);
  }

  @Patch(':id')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductSpecificationDto,
  ) {
    return this.specs.update(productId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.specs.remove(productId, id);
  }
}
