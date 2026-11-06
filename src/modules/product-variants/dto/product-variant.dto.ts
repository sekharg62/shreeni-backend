import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductVariantDto {
  /** e.g. "Free Size", "XS", "M" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  size!: string;

  /** Unique sellable-unit code, e.g. "SUTAMIH618-XS". */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^[A-Za-z0-9_-]{2,50}$/, {
    message: 'sku must be 2–50 characters: letters, numbers, "-" or "_"',
  })
  sku!: string;

  /** Units on hand. */
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  /** Overrides the product price for this size, in paise. */
  @IsOptional()
  @IsInt()
  @Min(1)
  priceOverride?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReplaceProductVariantDto extends CreateProductVariantDto {}

export class UpdateProductVariantDto extends PartialType(CreateProductVariantDto) {}
