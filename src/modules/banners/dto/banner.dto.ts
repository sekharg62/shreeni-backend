import { PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CatalogStatus } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

const URL_OPTS = { require_tld: false, protocols: ['http', 'https'], require_protocol: true };

export class CreateBannerDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  subtitle?: string;

  /** Desktop image URL (from the image uploader). */
  @IsUrl(URL_OPTS)
  imageUrl!: string;

  /** Optional separate mobile crop. */
  @IsOptional()
  @IsUrl(URL_OPTS)
  mobileImageUrl?: string;

  /** Where the slide links: a site path ("/sarees/jamdani") or a full URL. */
  @IsOptional()
  @Matches(/^(\/|https?:\/\/)/, { message: 'linkUrl must start with "/" or http(s)://' })
  linkUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}

export class ReplaceBannerDto extends CreateBannerDto {}

export class UpdateBannerDto extends PartialType(CreateBannerDto) {}

export class QueryBannerDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;

  @IsOptional()
  @IsIn(['sortOrder', 'createdAt'])
  sortBy: 'sortOrder' | 'createdAt' = 'sortOrder';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
