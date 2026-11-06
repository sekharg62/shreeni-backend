import { PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CatalogStatus, Gender } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { SLUG_MESSAGE, SLUG_REGEX } from '../../../common/utils/validation.js';

const URL_OPTS = { require_tld: false, protocols: ['http', 'https'], require_protocol: true };

export class CreateCategoryDto {
  /** e.g. "Jamdani" */
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

  /** Parent category id; omit (or null) for a top-level category. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID('all')
  parentId?: string | null;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  /** Banner image URL (from the image uploader). */
  @IsOptional()
  @IsUrl(URL_OPTS)
  bannerUrl?: string;

  /** Poster image URL (from the image uploader). */
  @IsOptional()
  @IsUrl(URL_OPTS)
  posterUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}

export class ReplaceCategoryDto extends CreateCategoryDto {}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class QueryCategoryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;

  /** A parent id, or "root" for top-level categories only. */
  @IsOptional()
  @ValidateIf((_, v) => v !== 'root')
  @IsUUID('all')
  parentId?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsIn(['createdAt', 'name', 'sortOrder'])
  sortBy: 'createdAt' | 'name' | 'sortOrder' = 'sortOrder';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @Type(() => String)
  sortOrder: 'asc' | 'desc' = 'asc';
}
