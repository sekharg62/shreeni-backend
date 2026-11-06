import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { ReviewsService } from './reviews.service.js';
import { BulkReviewStatusDto, QueryReviewDto, UpdateReviewStatusDto } from './dto/review.dto.js';

/** Moderation queue: approve/reject/delete customer reviews. */
@ApiTags('Admin · Reviews')
@AdminOnly()
@Controller('admin/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  findAll(@Query() query: QueryReviewDto) {
    return this.reviews.findAll(query);
  }

  /** { PENDING, APPROVED, REJECTED, ALL } — for the moderation tabs. */
  @Get('counts')
  counts() {
    return this.reviews.counts();
  }

  /** Approve / reject / reset many reviews in one call. */
  @Patch('status')
  setManyStatus(@Body() dto: BulkReviewStatusDto) {
    return this.reviews.setManyStatus(dto.ids, dto.status);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.findOne(id);
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReviewStatusDto) {
    return this.reviews.setStatus(id, dto.status);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.remove(id);
  }
}
