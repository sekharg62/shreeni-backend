import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { PublicReviewsController } from './public-reviews.controller.js';
import { PublicReviewsService } from './public-reviews.service.js';

@Module({
  controllers: [ReviewsController, PublicReviewsController],
  providers: [ReviewsService, PublicReviewsService],
})
export class ReviewsModule {}
