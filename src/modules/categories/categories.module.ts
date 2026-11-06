import { Module } from '@nestjs/common';
import { S3ImgUploaderModule } from '../s3-img-uploader/s3-img-uploader.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

@Module({
  imports: [S3ImgUploaderModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
