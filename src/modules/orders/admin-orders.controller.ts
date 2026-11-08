import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { AdminOrderStatusDto, AdminOrdersQueryDto } from './dto/order.dto.js';
import { AdminOrdersService } from './admin-orders.service.js';

/** Order desk: search, view, and move orders through confirm → pack → ship → deliver (or cancel/return). */
@ApiTags('Admin · Orders')
@AdminOnly()
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  findAll(@Query() query: AdminOrdersQueryDto) {
    return this.orders.list(query);
  }

  /** Per-status counts + today's orders and revenue. */
  @Get('counts')
  counts() {
    return this.orders.counts();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Patch(':id/status')
  setStatus(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminOrderStatusDto) {
    return this.orders.setStatus(req.user!.sub, id, dto);
  }
}
