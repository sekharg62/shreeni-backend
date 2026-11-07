import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CustomerOnly } from '../../common/authz/customer-only.decorator.js';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { CartDto, CartItemsDto, SetCartQuantityDto } from './dto/cart.dto.js';
import { CartService } from './cart.service.js';

/** The signed-in customer's cart. Every response is the whole cart with live prices. */
@ApiTags('Storefront · Cart')
@CustomerOnly()
@Controller('me/cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOkResponse({ type: CartDto })
  get(@Req() req: AuthenticatedRequest): Promise<CartDto> {
    return this.cart.get(req.user!.sub);
  }

  /** Declared before 'items/:variantId' for clarity; different paths anyway. */
  @Post('merge')
  @HttpCode(200)
  @ApiOkResponse({ type: CartDto, description: 'The cart after adding the guest items' })
  merge(@Req() req: AuthenticatedRequest, @Body() dto: CartItemsDto): Promise<CartDto> {
    return this.cart.merge(req.user!.sub, dto.items);
  }

  @Put('items/:variantId')
  @RateLimit(120, 60_000)
  @ApiOkResponse({ type: CartDto })
  @ApiNotFoundResponse({ description: 'Product or size not available' })
  @ApiBadRequestResponse({ description: 'Out of stock, or cart is full' })
  setQuantity(
    @Req() req: AuthenticatedRequest,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: SetCartQuantityDto,
  ): Promise<CartDto> {
    return this.cart.setQuantity(req.user!.sub, variantId, dto.quantity);
  }

  @Delete('items/:variantId')
  @ApiOkResponse({ type: CartDto })
  remove(@Req() req: AuthenticatedRequest, @Param('variantId', ParseUUIDPipe) variantId: string): Promise<CartDto> {
    return this.cart.remove(req.user!.sub, variantId);
  }

  @Delete()
  @ApiOkResponse({ type: CartDto, description: 'The (now empty) cart' })
  clear(@Req() req: AuthenticatedRequest): Promise<CartDto> {
    return this.cart.clear(req.user!.sub);
  }
}
