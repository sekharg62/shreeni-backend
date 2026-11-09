import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import { AdminCustomersQueryDto } from './dto/admin-customers.dto.js';
import { AdminCustomersService } from './admin-customers.service.js';

/** Registered customers: order count, total spent, saved addresses. Read-only. */
@ApiTags('Admin · Customers')
@AdminOnly()
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  @Get()
  findAll(@Query() query: AdminCustomersQueryDto) {
    return this.customers.list(query);
  }

  /** Saved addresses + 5 latest orders (loaded when the admin expands a row). */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.get(id);
  }
}
