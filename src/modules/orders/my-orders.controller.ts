import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { CustomerOnly } from '../../common/authz/customer-only.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { CancelOrderDto, MyOrdersQueryDto, OrderDetailDto, OrderPageDto } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

/** The signed-in customer's orders. */
@ApiTags('Storefront · Checkout & Orders')
@CustomerOnly()
@Controller('me/orders')
export class MyOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOkResponse({ type: OrderPageDto, description: 'Newest first' })
  list(@Req() req: AuthenticatedRequest, @Query() q: MyOrdersQueryDto): Promise<OrderPageDto> {
    return this.orders.listMine(req.user!.sub, q);
  }

  @Get(':orderNumber')
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiNotFoundResponse()
  get(@Req() req: AuthenticatedRequest, @Param('orderNumber') orderNumber: string): Promise<OrderDetailDto> {
    return this.orders.getMine(req.user!.sub, orderNumber);
  }

  @Post(':orderNumber/cancel')
  @RateLimit(10, 60_000)
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ description: 'Already packed, shipped or cancelled' })
  @ApiNotFoundResponse()
  cancel(@Req() req: AuthenticatedRequest, @Param('orderNumber') orderNumber: string, @Body() dto: CancelOrderDto): Promise<OrderDetailDto> {
    return this.orders.cancelMine(req.user!.sub, orderNumber, dto.reason);
  }
}
