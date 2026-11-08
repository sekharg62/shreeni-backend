import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { OptionalAuth } from '../../common/authz/optional-auth.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { CheckoutQuoteDto, CheckoutQuoteRequestDto, OrderDetailDto, PlaceOrderDto, TrackOrderDto } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

/** Checkout for guests and signed-in customers (send the token when signed in), plus guest order tracking. */
@ApiTags('Storefront · Checkout & Orders')
@Controller()
export class CheckoutController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout/quote')
  @HttpCode(200)
  @OptionalAuth()
  @RateLimit(60, 60_000)
  @ApiOkResponse({ type: CheckoutQuoteDto, description: 'Live prices, coupon result and totals. Saves nothing.' })
  quote(@Req() req: AuthenticatedRequest, @Body() dto: CheckoutQuoteRequestDto): Promise<CheckoutQuoteDto> {
    return this.orders.quote(req.user, dto);
  }

  @Post('orders')
  @OptionalAuth()
  @RateLimit(10, 10 * 60_000)
  @ApiCreatedResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ description: 'Invalid details or coupon' })
  @ApiConflictResponse({ description: 'Something sold out or changed — refresh the cart' })
  @ApiTooManyRequestsResponse()
  place(@Req() req: AuthenticatedRequest, @Body() dto: PlaceOrderDto): Promise<OrderDetailDto> {
    return this.orders.place(req.user, dto);
  }

  @Post('orders/track')
  @HttpCode(200)
  @RateLimit(10, 60_000)
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiNotFoundResponse({ description: 'No order with this number and phone/email' })
  @ApiTooManyRequestsResponse()
  track(@Body() dto: TrackOrderDto): Promise<OrderDetailDto> {
    return this.orders.track(dto);
  }
}
