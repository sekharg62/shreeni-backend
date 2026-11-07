import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { CartDto, CartItemsDto } from './dto/cart.dto.js';
import { CartService } from './cart.service.js';

/** Guests keep their cart in the browser; this refreshes it with live prices and stock. */
@ApiTags('Storefront · Cart')
@Controller('cart')
export class PublicCartController {
  constructor(private readonly cart: CartService) {}

  @Post('preview')
  @HttpCode(200)
  @RateLimit(60, 60_000)
  @ApiOkResponse({ type: CartDto, description: 'Sizes that no longer exist are left out' })
  preview(@Body() dto: CartItemsDto): Promise<CartDto> {
    return this.cart.preview(dto.items);
  }
}
