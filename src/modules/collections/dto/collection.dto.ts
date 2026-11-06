import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { ToBoolean } from '../../../common/dto/transforms.js';
import { SLUG_MESSAGE, SLUG_REGEX } from '../../../common/utils/validation.js';

export class CreateCollectionDto {
  /** e.g. "Diwali Edit" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** Auto-generated from name when omitted. */
  @IsOptional()
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReplaceCollectionDto extends CreateCollectionDto {}

export class UpdateCollectionDto extends PartialType(CreateCollectionDto) {}

export class QueryCollectionDto extends PaginationQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['createdAt', 'name'])
  sortBy: 'createdAt' | 'name' = 'createdAt';
}
