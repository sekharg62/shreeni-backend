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

  @ApiProperty({ description: 'false when every size is sold out' })
  inStock!: boolean;
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

/** `GET /products/:slug` and `/products/:slug/related` */
export class ProductSlugParamDto {
  @ApiProperty({ example: 'red-jamdani-handloom-saree' })
  @IsString()
  @MaxLength(200)
  @Matches(SLUG_REGEX, { message: 'slug must be a product slug, e.g. "red-jamdani-saree"' })
  slug!: string;
}

/** `GET /products/:slug/related?limit=8` */
export class RelatedProductsQueryDto {
  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit: number = 8;
}

export class PublicProductImageDto {
  @ApiProperty() url!: string;
}

export class PublicVariantDto {
  /** Needed by the cart. */
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Free Size' }) size!: string;
  @ApiProperty({ description: 'Paise' }) price!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Paise; struck-through price' })
  compareAtPrice!: number | null;
  @ApiProperty({ description: 'Units that can be ordered now, capped at 10 (0 = sold out)' })
  available!: number;
}

export class PublicTagDto {
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true, example: '#8B1E3F' }) color!: string | null;
}

export class PublicColorDto {
  @ApiProperty({ enum: ['PRIMARY', 'SECONDARY'] }) type!: 'PRIMARY' | 'SECONDARY';
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) hexCode!: string | null;
}

export class PublicSpecDto {
  @ApiProperty() label!: string;
  @ApiProperty() value!: string;
}

export class PublicSpecGroupsDto {
  @ApiProperty({ type: PublicSpecDto, isArray: true }) details!: PublicSpecDto[];
  @ApiProperty({ type: PublicSpecDto, isArray: true }) manufacturing!: PublicSpecDto[];
}

export class PublicProductFactsDto {
  @ApiProperty({ type: String, nullable: true }) fabric!: string | null;
  @ApiProperty({ type: Number, nullable: true }) lengthCm!: number | null;
  @ApiProperty({ type: Number, nullable: true }) widthCm!: number | null;
  @ApiProperty() blousePiece!: boolean;
  @ApiProperty({ type: String, nullable: true }) blousePieceInfo!: string | null;
  @ApiProperty({ type: String, nullable: true }) washCare!: string | null;
}

export class PublicMakerDto {
  @ApiProperty({ type: String, nullable: true }) countryOfOrigin!: string | null;
  @ApiProperty({ type: String, nullable: true }) manufacturedBy!: string | null;
  @ApiProperty({ type: String, nullable: true }) manufacturerAddress!: string | null;
}

export class PublicCrumbDto {
  @ApiProperty() name!: string;
  /** null when that category isn't published (not linkable). */
  @ApiProperty({ type: String, nullable: true }) slug!: string | null;
}

/** Product page — display fields only. Prices in paise. */
export class PublicProductDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) shortDescription!: string | null;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, nullable: true }) story!: string | null;
  @ApiProperty({ description: 'Paise' }) price!: number;
  @ApiProperty({ type: Number, nullable: true }) compareAtPrice!: number | null;
  @ApiProperty({ type: PublicProductImageDto, isArray: true }) images!: PublicProductImageDto[];
  @ApiProperty({ type: PublicVariantDto, isArray: true }) variants!: PublicVariantDto[];
  @ApiProperty({ type: PublicTagDto, isArray: true }) tags!: PublicTagDto[];
  @ApiProperty({ type: PublicColorDto, isArray: true }) colors!: PublicColorDto[];
  @ApiProperty({ type: PublicProductFactsDto }) facts!: PublicProductFactsDto;
  @ApiProperty({ type: PublicSpecGroupsDto }) specifications!: PublicSpecGroupsDto;
  @ApiProperty({ type: PublicMakerDto }) maker!: PublicMakerDto;
  /** Category path for the breadcrumb, top-most first, ending with the product's own category. */
  @ApiProperty({ type: PublicCrumbDto, isArray: true }) breadcrumb!: PublicCrumbDto[];
}
