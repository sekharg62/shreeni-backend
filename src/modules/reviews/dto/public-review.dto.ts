import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `/products/:slug/reviews` */
export class ReviewProductParamDto {
  @ApiProperty({ example: 'red-jamdani-handloom-saree' })
  @IsString()
  @MaxLength(200)
  @Matches(SLUG, { message: 'slug must be a product slug' })
  slug!: string;
}

/** `GET /products/:slug/reviews?page=1&limit=5` */
export class PublicReviewQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page: number = 1;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
}

/** `POST /products/:slug/reviews` — name and email come from the account, not the body. */
export class CreatePublicReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @Type(() => Number)
  @IsInt({ message: 'Choose a star rating' })
  @Min(1, { message: 'Choose a star rating' })
  @Max(5, { message: 'Choose a star rating' })
  rating!: number;

  @ApiProperty({ example: 'Beautiful weave', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Add a title' })
  @MaxLength(120, { message: 'Title must be at most 120 characters' })
  title!: string;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Review must be at least 10 characters' })
  @MaxLength(2000, { message: 'Review must be at most 2000 characters' })
  body!: string;
}

/** One approved review as the storefront shows it. No email, id or status. */
export class PublicReviewDto {
  @ApiProperty() rating!: number;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ example: 'Priya S.' }) reviewerName!: string;
  @ApiProperty() createdAt!: Date;
}

export class ReviewSummaryDto {
  @ApiProperty({ example: 4.6, description: 'Average of approved reviews, 1 decimal; 0 when none' })
  average!: number;
  @ApiProperty({ example: 12 }) count!: number;
  @ApiProperty({ example: { '5': 9, '4': 2, '3': 1, '2': 0, '1': 0 } })
  distribution!: Record<'1' | '2' | '3' | '4' | '5', number>;
}

class ReviewPageMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class PublicReviewPageDto {
  @ApiProperty({ type: ReviewSummaryDto }) summary!: ReviewSummaryDto;
  @ApiProperty({ type: PublicReviewDto, isArray: true }) data!: PublicReviewDto[];
  @ApiProperty({ type: ReviewPageMetaDto }) meta!: ReviewPageMetaDto;
}

/** The signed-in customer's own review of a product (any status). */
export class MyReviewDto {
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] }) status!: 'PENDING' | 'APPROVED' | 'REJECTED';
  @ApiProperty() rating!: number;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
}
