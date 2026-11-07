import { Body, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/authz/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../../common/authz/roles.guard.js';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { PublicReviewsService } from './public-reviews.service.js';
import {
  CreatePublicReviewDto,
  MyReviewDto,
  PublicReviewPageDto,
  PublicReviewQueryDto,
  ReviewProductParamDto,
} from './dto/public-review.dto.js';

/** Storefront reviews: anyone reads approved ones; signed-in customers write. */
@ApiTags('Storefront · Reviews')
@Controller('products/:slug/reviews')
export class PublicReviewsController {
  constructor(private readonly reviews: PublicReviewsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: PublicReviewPageDto })
  @ApiNotFoundResponse({ description: 'No published product with that slug' })
  list(@Param() p: ReviewProductParamDto, @Query() q: PublicReviewQueryDto): Promise<PublicReviewPageDto> {
    return this.reviews.list(p.slug, q);
  }

  /** The signed-in customer's own review (any status), or null — so the page can show "awaiting approval". */
  @Get('mine')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @ApiBearerAuth()
  @ApiOkResponse({ type: MyReviewDto })
  @ApiUnauthorizedResponse({ description: 'Not signed in' })
  mine(@Param() p: ReviewProductParamDto, @Req() req: AuthenticatedRequest): Promise<MyReviewDto | null> {
    return this.reviews.mine(p.slug, req.user!.sub);
  }

  @Post()
  @UseGuards(ThrottlerGuard, JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @Throttle({ auth: { limit: 5, ttl: 60 * 60_000 } })
  @ApiBearerAuth()
  @ApiCreatedResponse({ type: MyReviewDto, description: 'Saved as PENDING until approved' })
  @ApiUnauthorizedResponse({ description: 'Not signed in' })
  @ApiConflictResponse({ description: 'Already reviewed this product' })
  @ApiTooManyRequestsResponse({ description: 'Too many reviews' })
  create(
    @Param() p: ReviewProductParamDto,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePublicReviewDto,
  ): Promise<MyReviewDto> {
    return this.reviews.create(p.slug, req.user!.sub, dto);
  }
}
