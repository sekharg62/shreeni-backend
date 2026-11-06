import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ReviewStatus } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';

/** PATCH /admin/reviews/:id/status — approve, reject, or send back to pending. */
export class UpdateReviewStatusDto {
  @IsEnum(ReviewStatus)
  status!: ReviewStatus;
}

/** PATCH /admin/reviews/status — moderate many reviews at once. */
export class BulkReviewStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];

  @IsEnum(ReviewStatus)
  status!: ReviewStatus;
}

export class QueryReviewDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @IsOptional()
  @IsUUID('all')
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsIn(['createdAt', 'rating'])
  sortBy: 'createdAt' | 'rating' = 'createdAt';
}
