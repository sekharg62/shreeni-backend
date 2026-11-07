import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SupportReason, SupportStatus } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

export const DESCRIPTION_MIN = 20;
export const TEXT_MAX = 2000;
/** Tickets a customer can have that aren't closed yet. */
export const MAX_ACTIVE_TICKETS = 5;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/* ───────────── Requests ───────────── */

/** `POST /me/support-tickets` */
export class CreateSupportTicketDto {
  @ApiProperty({ enum: SupportReason, example: SupportReason.DELIVERY })
  @IsEnum(SupportReason, { message: 'Choose what your request is about' })
  reason!: SupportReason;

  @ApiProperty({ minLength: DESCRIPTION_MIN, maxLength: TEXT_MAX, example: 'My order was due on Monday but has not arrived yet.' })
  @Transform(trim)
  @IsString()
  @MinLength(DESCRIPTION_MIN, { message: `Please describe the problem in at least ${DESCRIPTION_MIN} characters` })
  @MaxLength(TEXT_MAX, { message: `Please keep it under ${TEXT_MAX} characters` })
  description!: string;
}

/** `POST …/:id/messages` (customer and admin) */
export class SupportReplyDto {
  @ApiProperty({ minLength: 1, maxLength: TEXT_MAX })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Write a message first' })
  @MaxLength(TEXT_MAX, { message: `Please keep it under ${TEXT_MAX} characters` })
  body!: string;
}

/** `GET /me/support-tickets` */
export class MySupportQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}

/** `GET /admin/support-tickets` — `search` matches "SUP-1042" / 1042, or the customer's name, phone or email. */
export class AdminSupportQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SupportStatus)
  status?: SupportStatus;

  @IsOptional()
  @IsEnum(SupportReason)
  reason?: SupportReason;

  /** Within each status group. Default: latest activity. */
  @IsOptional()
  @IsIn(['lastMessageAt', 'createdAt'])
  sortBy: 'lastMessageAt' | 'createdAt' = 'lastMessageAt';
}

/** `PATCH /admin/support-tickets/:id/status` */
export class AdminSupportStatusDto {
  @ApiProperty({ enum: ['RESOLVED', 'CLOSED'] })
  @IsIn([SupportStatus.RESOLVED, SupportStatus.CLOSED], { message: 'status must be RESOLVED or CLOSED' })
  status!: 'RESOLVED' | 'CLOSED';
}

/* ───────────── Customer responses ───────────── */

export class SupportMessageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  /** Who wrote it. Admin identities are never shown to customers. */
  @ApiProperty({ enum: ['CUSTOMER', 'SUPPORT'] }) from!: 'CUSTOMER' | 'SUPPORT';
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
}

export class SupportTicketSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 1042 }) ticketNumber!: number;
  @ApiProperty({ enum: SupportReason }) reason!: SupportReason;
  @ApiProperty({ enum: SupportStatus }) status!: SupportStatus;
  @ApiProperty() description!: string;
  @ApiProperty() lastMessageAt!: Date;
  @ApiProperty() createdAt!: Date;
  /** Who spoke last — lets the list show "Support replied". null = no replies yet. */
  @ApiProperty({ enum: ['CUSTOMER', 'SUPPORT'], nullable: true, type: String }) lastReplyFrom!: 'CUSTOMER' | 'SUPPORT' | null;
}

export class SupportTicketDetailDto extends SupportTicketSummaryDto {
  @ApiProperty({ type: Date, nullable: true }) closedAt!: Date | null;
  @ApiProperty({ type: SupportMessageDto, isArray: true }) messages!: SupportMessageDto[];
}

class PageMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class SupportTicketPageDto {
  @ApiProperty({ type: SupportTicketSummaryDto, isArray: true }) data!: SupportTicketSummaryDto[];
  @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;
}
