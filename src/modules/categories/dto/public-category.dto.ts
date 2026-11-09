import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { SLUG_MESSAGE, SLUG_REGEX } from '../../../common/utils/validation.js';

/** `GET /categories/children?slug=saree` */
export class CategoryChildrenQueryDto {
  @ApiProperty({ example: 'saree', description: 'Slug of the parent category' })
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug!: string;
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
