import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { S3ImgUploaderModule } from './modules/s3-img-uploader/s3-img-uploader.module.js';
import { TagsModule } from './modules/tags/tags.module.js';
import { ColorsModule } from './modules/colors/colors.module.js';
import { CollectionsModule } from './modules/collections/collections.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { BannersModule } from './modules/banners/banners.module.js';
import { DiscountsModule } from './modules/discounts/discounts.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { ProductImagesModule } from './modules/product-images/product-images.module.js';
import { ProductVariantsModule } from './modules/product-variants/product-variants.module.js';
import { ProductSpecificationsModule } from './modules/product-specifications/product-specifications.module.js';
import { ProductTagsModule } from './modules/product-tags/product-tags.module.js';
import { ProductCollectionsModule } from './modules/product-collections/product-collections.module.js';
import { ProductColorsModule } from './modules/product-colors/product-colors.module.js';
import { RelatedProductsModule } from './modules/related-products/related-products.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import configuration from './config/configuration.js';
import { validateEnv } from './config/env.validation.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    S3ImgUploaderModule,
    TagsModule,
    ColorsModule,
    CollectionsModule,
    CategoriesModule,
    BannersModule,
    DiscountsModule,
    ProductsModule,
    ProductImagesModule,
    ProductVariantsModule,
    ProductSpecificationsModule,
    ProductTagsModule,
    ProductCollectionsModule,
    ProductColorsModule,
    RelatedProductsModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
