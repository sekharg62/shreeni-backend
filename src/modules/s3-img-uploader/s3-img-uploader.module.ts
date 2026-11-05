import { Module } from '@nestjs/common';
import { S3ImgUploaderController } from './s3-img-uploader.controller.js';
import { S3ImgUploaderService } from './s3-img-uploader.service.js';

@Module({
  controllers: [S3ImgUploaderController],
  providers: [S3ImgUploaderService],
  exports: [S3ImgUploaderService],
})
export class S3ImgUploaderModule {}
