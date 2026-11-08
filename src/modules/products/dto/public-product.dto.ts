import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { SLUG_REGEX } from '../../../common/utils/validation.js';

/** Comma-separated query values → string[] ("red,teal" → ["red", "teal"]). */
const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    : value;
const bool = ({ value }: { value: unknown }) => (value === 'true' || value === '1' || value === true ? true : value === 'false' || value === '0' ? false : value);

export const PRODUCT_SORTS = ['featured', 'newest', 'price-asc', 'price-desc', 'discount'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Filters shared by `GET /products` and `GET /products/facets`. Prices are in paise. */
export class PublicProductFiltersDto {
  @ApiProperty({ example: 'kantha-stitch', description: 'Category slug; its sub-categories are included' })
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: 'category must be a category slug, e.g. "kantha-stitch"' })
  category!: string;

  @ApiPropertyOptional({ description: 'Lowest selling price, in paise', example: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Highest selling price, in paise', example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Main colour slugs, comma-separated (any of)', example: 'red,teal' })
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(SLUG_REGEX, { each: true, message: 'colors must be colour slugs, e.g. "light-pink"' })
  colors?: string[];

  @ApiPropertyOptional({ description: 'Tag slugs, comma-separated (any of)', example: 'bridal,festive' })
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(SLUG_REGEX, { each: true, message: 'tags must be tag slugs, e.g. "zari-work"' })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Minimum discount % (offers)', example: 20, minimum: 1, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  minDiscount?: number;

  @ApiPropertyOptional({ description: 'Only products with a size in stock' })
  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  inStock?: boolean;
}

/** `GET /products?category=kantha-stitch&page=1&limit=24&colors=red&sort=price-asc` */
export class PublicProductQueryDto extends PublicProductFiltersDto {
  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'featured' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'featured';

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

/* ───────────── Facets (filter options with counts) ───────────── */

export class ColorFacetDto {
  @ApiProperty({ example: 'red' }) slug!: string;
  @ApiProperty({ example: 'Red' }) name!: string;
  @ApiProperty({ type: String, nullable: true, example: '#c8102e' }) hexCode!: string | null;
  @ApiProperty() count!: number;
}

export class TagFacetDto {
  @ApiProperty({ example: 'bridal' }) slug!: string;
  @ApiProperty({ example: 'Bridal' }) name!: string;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
  @ApiProperty() count!: number;
}

export class PriceBucketDto {
  /** paise; null = no lower bound */
  @ApiProperty({ type: Number, nullable: true }) min!: number | null;
  /** paise; null = no upper bound */
  @ApiProperty({ type: Number, nullable: true }) max!: number | null;
  @ApiProperty() count!: number;
}

export class OfferFacetDto {
  @ApiProperty({ example: 20, description: 'Minimum % off' }) minDiscount!: number;
  @ApiProperty() count!: number;
}

/**
 * `GET /products/facets` — the filter options for a category, with counts.
 * Each group's counts apply every OTHER selected filter (so picking a colour updates the tag counts,
 * but the colour list still shows the other colours you could add).
 */
export class ProductFacetsDto {
  /** Products matching all selected filters. */
  @ApiProperty() total!: number;
  @ApiProperty({ type: ColorFacetDto, isArray: true }) colors!: ColorFacetDto[];
  @ApiProperty({ type: TagFacetDto, isArray: true }) tags!: TagFacetDto[];
  @ApiProperty({ type: PriceBucketDto, isArray: true }) priceBuckets!: PriceBucketDto[];
  /** Lowest/highest selling price (paise) among products matching the other filters; null when none. */
  @ApiProperty({ type: Number, nullable: true }) minPrice!: number | null;
  @ApiProperty({ type: Number, nullable: true }) maxPrice!: number | null;
  @ApiProperty({ type: OfferFacetDto, isArray: true }) offers!: OfferFacetDto[];
  /** How many matching products have a size in stock (ignoring the stock filter). */
  @ApiProperty() inStockCount!: number;
}
