import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DiscountType } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { ToBoolean, ToUpperTrim } from '../../../common/dto/transforms.js';

export class CreateDiscountDto {
  /** What customers type, e.g. "DIWALI20". Stored uppercase. */
  @ToUpperTrim()
  @Matches(/^[A-Z0-9_-]{3,30}$/, {
    message: 'code must be 3–30 characters: letters, numbers, "-" or "_"',
  })
  code!: string;

  /** Shown at checkout, e.g. "20% off on all sarees". */
  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  /** PERCENTAGE → percent (1–100). FLAT → amount in paise (20000 = ₹200). */
  @IsInt()
  @Min(1)
  value!: number;

  /** Cap for PERCENTAGE codes, in paise ("20% off up to ₹500" → 50000). */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDiscountAmount?: number;

  /** Cart subtotal needed to use the code, in paise. */
  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderValue?: number;

  /** Total uses allowed; omit for unlimited. */
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  /** Uses per customer, e.g. 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  /** ISO date-time, e.g. "2026-11-01T00:00:00+05:30". */
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReplaceDiscountDto extends CreateDiscountDto {}

export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {}

export class QueryDiscountDto extends PaginationQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(DiscountType)
  type?: DiscountType;

  @IsOptional()
  @IsIn(['createdAt', 'code', 'endsAt'])
  sortBy: 'createdAt' | 'code' | 'endsAt' = 'createdAt';
}
