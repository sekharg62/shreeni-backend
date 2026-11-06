import { PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import {
  HEX_COLOR_MESSAGE,
  HEX_COLOR_REGEX,
  SLUG_MESSAGE,
  SLUG_REGEX,
} from '../../../common/utils/validation.js';

export class CreateTagDto {
  /** e.g. "Saree with blouse piece" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  /** Auto-generated from name when omitted. */
  @IsOptional()
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug?: string;

  /** Badge color, e.g. "#b88646". */
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: `color ${HEX_COLOR_MESSAGE}` })
  color?: string;
}

/** PUT body = full replace (same rules as create). */
export class ReplaceTagDto extends CreateTagDto {}

/** PATCH body = any subset of fields. */
export class UpdateTagDto extends PartialType(CreateTagDto) {}

export class QueryTagDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['createdAt', 'name'])
  sortBy: 'createdAt' | 'name' = 'createdAt';
}
