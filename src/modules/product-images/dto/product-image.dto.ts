import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUrl, Min } from 'class-validator';

export class CreateProductImageDto {
  /** Image URL (normally added via POST /admin/products/:productId/images/upload instead). */
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  /** Display order (lower first). Defaults to the end of the gallery. */
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** The card thumbnail. Only one image per product is primary. */
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class ReplaceProductImageDto extends CreateProductImageDto {}

export class UpdateProductImageDto extends PartialType(CreateProductImageDto) {}
