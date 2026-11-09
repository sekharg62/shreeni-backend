import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min, MaxLength } from 'class-validator';
import { SLUG_MESSAGE, SLUG_REGEX } from '../../../common/utils/validation.js';

/** `GET /categories/children?slug=saree&page=1&limit=10` */
export class CategoryChildrenQueryDto {
  @ApiProperty({ example: 'saree', description: 'Slug of the parent category' })
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug!: string;

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Page number, starting at 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10, maximum: 50, description: 'Cards per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}

/** One sub-category card on the storefront — display fields only. */
export class PublicCategoryCardDto {
  @ApiProperty({ example: 'Kantha Stitch' })
  name!: string;

  @ApiProperty({ example: 'kantha-stitch' })
  slug!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Portrait card image (≈3:4)' })
  posterUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Mythology woven in silk' })
  tagline!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Lowest selling price in paise (null when empty)' })
  minPrice!: number | null;

  @ApiProperty({ description: 'Biggest % off right now (0 = nothing on sale)' })
  maxDiscountPercent!: number;
}

export class PageMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 10 }) limit!: number;
  @ApiProperty({ example: 14 }) total!: number;
  @ApiProperty({ example: 2 }) totalPages!: number;
}

/** `GET /categories/children` response: one page of cards + paging info. */
export class PublicCategoryCardPageDto {
  @ApiProperty({ type: PublicCategoryCardDto, isArray: true })
  data!: PublicCategoryCardDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}

/** `GET /categories/:slug` */
export class CategorySlugParamDto {
  @ApiProperty({ example: 'kantha-stitch' })
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug!: string;
}

/** A breadcrumb step above the category. `slug` is null when that parent isn't published (not linkable). */
export class CategoryCrumbDto {
  @ApiProperty({ example: 'Saree' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'saree' })
  slug!: string | null;
}

/** Category page header — display fields only. */
export class PublicCategoryDetailDto {
  @ApiProperty({ example: 'Kantha Stitch' })
  name!: string;

  @ApiProperty({ example: 'kantha-stitch' })
  slug!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Wide desktop banner' })
  bannerUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Portrait image, used on phones' })
  posterUrl!: string | null;

  @ApiProperty({ type: CategoryCrumbDto, isArray: true, description: 'Parents, top-most first' })
  ancestors!: CategoryCrumbDto[];
}
