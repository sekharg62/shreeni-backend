import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/authz/admin-only.decorator.js';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import { AdminSupportQueryDto, AdminSupportStatusDto, SupportReplyDto } from './dto/support.dto.js';
import { SupportService } from './support.service.js';

/** Support inbox: read, reply, resolve and close customer tickets. */
@ApiTags('Admin · Support')
@AdminOnly()
@Controller('admin/support-tickets')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  findAll(@Query() query: AdminSupportQueryDto) {
    return this.support.adminList(query);
  }

  /** { OPEN, IN_PROGRESS, RESOLVED, CLOSED, ALL } — for the tabs and the sidebar badge. */
  @Get('counts')
  counts() {
    return this.support.adminCounts();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.adminGet(id);
  }

  @Post(':id/messages')
  reply(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportReplyDto) {
    return this.support.adminReply(req.user!.sub, id, dto.body);
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminSupportStatusDto) {
    return this.support.adminSetStatus(id, dto.status);
  }
}
