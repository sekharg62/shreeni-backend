import { PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { HEX_COLOR_MESSAGE, HEX_COLOR_REGEX } from '../../../common/utils/validation.js';

export class CreateColorDto {
  /** e.g. "Light Pink" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  /** e.g. "#f8c8d8" — used for the swatch on the storefront. */
  @IsOptional()
  @Matches(HEX_COLOR_REGEX, { message: `hexCode ${HEX_COLOR_MESSAGE}` })
  hexCode?: string;
}

export class ReplaceColorDto extends CreateColorDto {}

export class UpdateColorDto extends PartialType(CreateColorDto) {}

export class QueryColorDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['createdAt', 'name'])
  sortBy: 'createdAt' | 'name' = 'createdAt';
}
