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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  IMAGE_UPLOAD_LIMITS,
  MAX_FILES_PER_REQUEST,
} from '../s3-img-uploader/image-paths.js';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { ReorderDto } from '../../common/dto/common-body.dto.js';
import { ProductImagesService } from './product-images.service.js';
import {
  CreateProductImageDto,
  ReplaceProductImageDto,
  UpdateProductImageDto,
} from './dto/product-image.dto.js';

/** Every write returns the product's full, ordered image list. */
@ApiTags('Admin · Product images')
@AdminOnly()
@Controller('admin/products/:productId/images')
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Get()
  findAll(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.images.findAll(productId);
  }

  @Post()
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductImageDto,
  ) {
    return this.images.create(productId, dto);
  }

  /** Upload 1–10 image files → products/{productId}/ in S3, added to the gallery. */
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
      required: ['files'],
    },
  })
  @UseInterceptors(FilesInterceptor('files', MAX_FILES_PER_REQUEST, IMAGE_UPLOAD_LIMITS))
  upload(
    @Param('productId', ParseUUIDPipe) productId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.images.uploadMany(productId, files);
  }

  /** Drag-to-reorder: send every image id in the new order. */
  @Patch('reorder')
  reorder(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: ReorderDto) {
    return this.images.reorder(productId, dto.ids);
  }

  @Patch(':id/primary')
  setPrimary(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.images.setPrimary(productId, id);
  }

  @Put(':id')
  replace(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceProductImageDto,
  ) {
    return this.images.replace(productId, id, dto);
  }

  @Patch(':id')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductImageDto,
  ) {
    return this.images.update(productId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.images.remove(productId, id);
  }
}
