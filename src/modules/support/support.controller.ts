import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard.js';
import { CustomerOnly } from '../../common/authz/customer-only.decorator.js';
import type { AuthenticatedRequest } from '../../common/authz/auth-user.js';
import {
  CreateSupportTicketDto,
  MySupportQueryDto,
  SupportReplyDto,
  SupportTicketDetailDto,
  SupportTicketPageDto,
} from './dto/support.dto.js';
import { SupportService } from './support.service.js';

/** The signed-in customer's support requests. */
@ApiTags('Storefront · Support')
@CustomerOnly()
@Controller('me/support-tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  @RateLimit(5, 60 * 60_000)
  @ApiCreatedResponse({ type: SupportTicketDetailDto })
  @ApiBadRequestResponse({ description: 'Invalid input, or too many open requests' })
  @ApiTooManyRequestsResponse({ description: 'Too many new requests' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateSupportTicketDto): Promise<SupportTicketDetailDto> {
    return this.support.create(req.user!.sub, dto);
  }

  @Get()
  @ApiOkResponse({ type: SupportTicketPageDto, description: 'Most recent activity first' })
  list(@Req() req: AuthenticatedRequest, @Query() q: MySupportQueryDto): Promise<SupportTicketPageDto> {
    return this.support.listMine(req.user!.sub, q);
  }

  @Get(':id')
  @ApiOkResponse({ type: SupportTicketDetailDto })
  @ApiNotFoundResponse()
  get(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<SupportTicketDetailDto> {
    return this.support.getMine(req.user!.sub, id);
  }

  @Post(':id/messages')
  @RateLimit(30, 15 * 60_000)
  @ApiCreatedResponse({ type: SupportTicketDetailDto, description: 'The ticket with the new message' })
  @ApiBadRequestResponse({ description: 'Ticket is closed' })
  @ApiNotFoundResponse()
  reply(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupportReplyDto,
  ): Promise<SupportTicketDetailDto> {
    return this.support.replyAsCustomer(req.user!.sub, id, dto.body);
  }

  @Patch(':id/close')
  @ApiOkResponse({ type: SupportTicketDetailDto })
  @ApiNotFoundResponse()
  close(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<SupportTicketDetailDto> {
    return this.support.closeMine(req.user!.sub, id);
  }
}
