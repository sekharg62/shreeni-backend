/// <reference types="multer" />
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { IMAGE_UPLOAD_LIMITS, ImagePaths, MAX_WIDTH } from './image-paths.js';
import { ImageUploadService } from './image-upload.service.js';
import { UploadCleanupService } from './upload-cleanup.service.js';
import { DiscardUploadDto } from './dto/discard-upload.dto.js';

const SINGLE_FILE_BODY = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
    required: ['file'],
  },
};

/**
 * Standalone uploads for records that need an image before they exist.
 * (Product and category images are uploaded through their own routes,
 * which also save the image on the record.)
 */
@ApiTags('Admin · Uploads')
@AdminOnly()
@Controller('admin/uploads')
export class UploadsController {
  constructor(
    private readonly uploads: ImageUploadService,
    private readonly cleanup: UploadCleanupService,
  ) {}

  /**
   * Discard an uploaded file by its URL — only if no record uses it
   * (e.g. the admin uploaded an image, then cancelled the form).
   * 409 if it's still in use: delete it through the owning record instead.
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  discard(@Body() dto: DiscardUploadDto) {
    return this.cleanup.discard(dto.url);
  }

  /** → banners/{uuid}.webp. Use the returned url as imageUrl / mobileImageUrl on a Banner. */
  @Post('banner')
  @ApiConsumes('multipart/form-data')
  @ApiBody(SINGLE_FILE_BODY)
  @UseInterceptors(FileInterceptor('file', IMAGE_UPLOAD_LIMITS))
  uploadBanner(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.uploads.uploadImage(file, ImagePaths.banner(), MAX_WIDTH.banner);
  }
}
