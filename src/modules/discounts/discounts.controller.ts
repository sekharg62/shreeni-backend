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
import { UpdateActiveStatusDto } from '../../common/dto/common-body.dto.js';
import { DiscountsService } from './discounts.service.js';
import {
  CreateDiscountDto,
  QueryDiscountDto,
  ReplaceDiscountDto,
  UpdateDiscountDto,
} from './dto/discount.dto.js';

@ApiTags('Admin · Discounts')
@AdminOnly()
@Controller('admin/discounts')
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get()
  findAll(@Query() query: QueryDiscountDto) {
    return this.discounts.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.discounts.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDiscountDto) {
    return this.discounts.create(dto);
  }

  @Put(':id')
  replace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceDiscountDto) {
    return this.discounts.replace(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActiveStatusDto) {
    return this.discounts.setActive(id, dto.isActive);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDiscountDto) {
    return this.discounts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.discounts.remove(id);
  }
}
