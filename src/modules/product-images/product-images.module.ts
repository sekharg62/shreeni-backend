import { Module } from '@nestjs/common';
import { S3ImgUploaderModule } from '../s3-img-uploader/s3-img-uploader.module.js';
import { ProductImagesController } from './product-images.controller.js';
import { ProductImagesService } from './product-images.service.js';

@Module({
  imports: [S3ImgUploaderModule],
  controllers: [ProductImagesController],
  providers: [ProductImagesService],
})
export class ProductImagesModule {}
