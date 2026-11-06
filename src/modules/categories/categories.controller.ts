/// <reference types="multer" />
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IMAGE_UPLOAD_LIMITS } from '../s3-img-uploader/image-paths.js';

import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { ReorderDto, UpdateCatalogStatusDto } from '../../common/dto/common-body.dto.js';
import { CategoriesService } from './categories.service.js';
import {
  CreateCategoryDto,
  QueryCategoryDto,
  ReplaceCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

const SINGLE_FILE_BODY = {
  schema: {
    type: 'object' as const,
    properties: { file: { type: 'string' as const, format: 'binary' } },
    required: ['file'],
  },
};

@ApiTags('Admin · Categories')
@AdminOnly()
@Controller('admin/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll(@Query() query: QueryCategoryDto) {
    return this.categories.findAll(query);
  }

  /** Nested parent → children tree. */
  @Get('tree')
  tree() {
    return this.categories.tree();
  }

  /**
   * Set the display order of sibling categories (same parent).
   * ids in the desired order; index becomes sortOrder.
   */
  @Patch('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.categories.reorder(dto.ids);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  /** Upload → categories/{id}/banner-*.webp; replaces (and deletes) the old banner. */
  @Post(':id/banner')
  @ApiConsumes('multipart/form-data')
  @ApiBody(SINGLE_FILE_BODY)
  @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD_LIMITS))
  uploadBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.categories.uploadImage(id, 'banner', file);
  }

  /** Upload → categories/{id}/poster-*.webp; replaces (and deletes) the old poster. */
  @Post(':id/poster')
  @ApiConsumes('multipart/form-data')
  @ApiBody(SINGLE_FILE_BODY)
  @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD_LIMITS))
  uploadPoster(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.categories.uploadImage(id, 'poster', file);
  }

  @Put(':id')
  replace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceCategoryDto) {
    return this.categories.replace(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogStatusDto) {
    return this.categories.setStatus(id, dto.status);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }
}
