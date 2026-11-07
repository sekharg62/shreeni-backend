import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min, IsOptional } from 'class-validator';
import { SLUG_REGEX } from '../../../common/utils/validation.js';

/** `GET /products?category=kantha-stitch&page=1&limit=24` */
export class PublicProductQueryDto {
  @ApiProperty({ example: 'kantha-stitch', description: 'Category slug; its sub-categories are included' })
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: 'category must be a category slug, e.g. "kantha-stitch"' })
  category!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page: number = 1;

  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 48 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit: number = 24;
}

/** One product card on the storefront — display fields only. Prices are in paise. */
export class PublicProductCardDto {
  /** Needed by cart / wishlist. */
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Red Kantha Stitch Silk Saree' })
  name!: string;

  @ApiProperty({ example: 'red-kantha-stitch-silk-saree' })
  slug!: string;

  @ApiProperty({ example: 349900, description: 'What the customer pays, in paise' })
  price!: number;

  @ApiProperty({ type: Number, nullable: true, example: 449900, description: 'Struck-through price (paise) when on discount' })
  compareAtPrice!: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Main photo (or first by order)' })
  imageUrl!: string | null;
}

class PageMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class PublicProductPageDto {
  @ApiProperty({ type: PublicProductCardDto, isArray: true })
  data!: PublicProductCardDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
