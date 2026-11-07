import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CustomerOnly } from '../../common/authz/customer-only.decorator.js';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { PublicProductCardDto } from '../products/dto/public-product.dto.js';
import { MergeWishlistDto } from './dto/wishlist.dto.js';
import { WishlistService } from './wishlist.service.js';

/** The signed-in customer's wishlist. */
@ApiTags('Storefront · Wishlist')
@CustomerOnly()
@Controller('me/wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOkResponse({ type: PublicProductCardDto, isArray: true, description: 'Most recently saved first' })
  list(@Req() req: AuthenticatedRequest): Promise<PublicProductCardDto[]> {
    return this.wishlist.list(req.user!.sub);
  }

  /** Declared before ':productId' so "merge" isn't read as a product id. */
  @Post('merge')
  @HttpCode(200)
  @ApiOkResponse({ type: PublicProductCardDto, isArray: true, description: 'The full wishlist after merging' })
  merge(@Req() req: AuthenticatedRequest, @Body() dto: MergeWishlistDto): Promise<PublicProductCardDto[]> {
    return this.wishlist.merge(req.user!.sub, dto.productIds);
  }

  @Put(':productId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Saved (or already saved)' })
  @ApiNotFoundResponse({ description: 'Product not found or not published' })
  @ApiBadRequestResponse({ description: 'Wishlist is full' })
  add(@Req() req: AuthenticatedRequest, @Param('productId', ParseUUIDPipe) productId: string): Promise<void> {
    return this.wishlist.add(req.user!.sub, productId);
  }

  @Delete(':productId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Removed (or was not saved)' })
  remove(@Req() req: AuthenticatedRequest, @Param('productId', ParseUUIDPipe) productId: string): Promise<void> {
    return this.wishlist.remove(req.user!.sub, productId);
  }
}
