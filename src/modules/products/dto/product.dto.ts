import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CatalogStatus, Gender } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { ToBoolean } from '../../../common/dto/transforms.js';
import { SLUG_MESSAGE, SLUG_REGEX } from '../../../common/utils/validation.js';
import { CreateProductImageDto } from '../../product-images/dto/product-image.dto.js';
import { CreateProductVariantDto } from '../../product-variants/dto/product-variant.dto.js';
import { CreateProductSpecificationDto } from '../../product-specifications/dto/product-specification.dto.js';
import { SetProductColorsDto } from '../../product-colors/dto/product-colors.dto.js';

/** GST slabs that apply to goods in India. */
export const GST_RATES = [0, 3, 5, 12, 18, 28] as const;

/** The product's own fields (no images/variants/etc.). Used by PUT and PATCH. */
export class ProductCoreDto {
  /** e.g. "Glitter Gulkand" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  /** Auto-generated from name when omitted. */
  @IsOptional()
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescription?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  /** The long narrative "Story" block. */
  @IsOptional()
  @IsString()
  story?: string;

  @IsUUID('all')
  categoryId!: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  /** e.g. "Mul Cotton" */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fabric?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  collectionName?: string;

  /** MRP in paise (₹1,499 → 149900). */
  @IsInt()
  @Min(1)
  originalPrice!: number;

  /** Selling price in paise; must be lower than originalPrice. */
  @IsOptional()
  @IsInt()
  @Min(1)
  discountPrice?: number;

  /** GST HSN code, 4–8 digits (e.g. "5208"). */
  @IsOptional()
  @Matches(/^\d{4,8}$/, { message: 'hsnCode must be 4–8 digits' })
  hsnCode?: string;

  /** GST %: one of 0, 3, 5, 12, 18, 28. Defaults to 5. */
  @IsOptional()
  @IsIn(GST_RATES)
  gstRate?: number;

  /** e.g. 550 (cm). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lengthCm?: number;

  /** e.g. 115 (cm). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  widthCm?: number;

  @IsOptional()
  @IsBoolean()
  blousePiece?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  blousePieceInfo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  washCare?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  manufacturedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  manufacturerAddress?: string;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * POST body: core fields plus everything that belongs to the product,
 * saved together in one transaction (one admin form, one Save).
 */
export class CreateProductDto extends ProductCoreDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductSpecificationDto)
  specifications?: CreateProductSpecificationDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  collectionIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SetProductColorsDto)
  colors?: SetProductColorsDto;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  relatedProductIds?: string[];
}

/** PUT body: full replace of the core fields (images/variants/etc. are edited via their own routes). */
export class ReplaceProductDto extends ProductCoreDto {}

/** PATCH body: any subset of the core fields. */
export class UpdateProductDto extends PartialType(ProductCoreDto) {}

export class QueryProductDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;

  @IsOptional()
  @IsUUID('all')
  categoryId?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsIn(['createdAt', 'name', 'originalPrice', 'sortOrder', 'publishedAt'])
  sortBy: 'createdAt' | 'name' | 'originalPrice' | 'sortOrder' | 'publishedAt' = 'createdAt';
}
