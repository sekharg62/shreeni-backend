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
import { ReorderDto, UpdateCatalogStatusDto } from '../../common/dto/common-body.dto.js';
import { BannersService } from './banners.service.js';
import {
  CreateBannerDto,
  QueryBannerDto,
  ReplaceBannerDto,
  UpdateBannerDto,
} from './dto/banner.dto.js';

@ApiTags('Admin · Banners')
@AdminOnly()
@Controller('admin/banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  findAll(@Query() query: QueryBannerDto) {
    return this.banners.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.banners.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBannerDto) {
    return this.banners.create(dto);
  }

  /** Declared before ':id' routes so "reorder" isn't parsed as an id. */
  @Patch('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.banners.reorder(dto.ids);
  }

  @Put(':id')
  replace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceBannerDto) {
    return this.banners.replace(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogStatusDto) {
    return this.banners.setStatus(id, dto.status);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBannerDto) {
    return this.banners.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.banners.remove(id);
  }
}
