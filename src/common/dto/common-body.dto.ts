import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { CatalogStatus } from '../../generated/prisma/enums.js';

/** PATCH /:id/status for catalog records (Category, Product, Banner). */
export class UpdateCatalogStatusDto {
  @IsEnum(CatalogStatus)
  status!: CatalogStatus;
}

/** PATCH /:id/status for on/off records (Collection, Discount, Variant). */
export class UpdateActiveStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

/** PATCH /reorder — ids in the desired display order (index = sortOrder). */
export class ReorderDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

/** PATCH /status (bulk) for catalog records — e.g. publish 10 products at once. */
export class BulkCatalogStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];

  @IsEnum(CatalogStatus)
  status!: CatalogStatus;
}
