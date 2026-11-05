/// <reference types="multer" />
import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MAX_IMAGE_SIZE_BYTES,
  S3ImgUploaderService,
} from './s3-img-uploader.service.js';
import { UploadImageDto } from './dto/upload-image.dto.js';

@Controller('s3-img-uploader')
export class S3ImgUploaderController {
  constructor(private readonly uploader: S3ImgUploaderService) {}

  /**
   * POST /s3-img-uploader/upload
   * multipart/form-data: `file` (image, required), `folder` (optional)
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadImageDto,
  ) {
    return this.uploader.uploadImage(file, dto.folder);
  }
}
