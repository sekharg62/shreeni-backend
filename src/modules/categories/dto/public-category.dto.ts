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
}
