import { Module } from '@nestjs/common';
import { S3ImgUploaderModule } from '../s3-img-uploader/s3-img-uploader.module.js';
import { BannersController } from './banners.controller.js';
import { BannersService } from './banners.service.js';
import { PublicBannersController } from './public-banners.controller.js';

@Module({
  imports: [S3ImgUploaderModule],
  controllers: [BannersController, PublicBannersController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}
