import { Module } from '@nestjs/common';
import { ImageProcessorService } from './image-processor.service.js';
import { ImageUploadService } from './image-upload.service.js';
import { S3StorageService } from './s3-storage.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadCleanupService } from './upload-cleanup.service.js';

/**
 * Shared image storage: S3 upload/delete + WebP optimisation.
 * Imported by Products, Product images, Categories and Banners.
 */
@Module({
  controllers: [UploadsController],
  providers: [S3StorageService, ImageProcessorService, ImageUploadService, UploadCleanupService],
  exports: [S3StorageService, ImageUploadService],
})
export class S3ImgUploaderModule {}
