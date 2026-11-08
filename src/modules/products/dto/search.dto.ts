import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PublicProductCardDto } from './public-product.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

export const SEARCH_SORTS = ['relevance', 'newest', 'price-asc', 'price-desc', 'discount'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

/** `GET /products/search?q=red silk&page=1&limit=24&sort=relevance` */
export class SearchQueryDto {
  @ApiProperty({ example: 'red silk', minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Type something to search for' })
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ enum: SEARCH_SORTS, default: 'relevance' })
  @IsOptional()
  @IsIn(SEARCH_SORTS)
  sort: SearchSort = 'relevance';

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

/** `GET /products/suggest?q=balu` — search-as-you-type. */
export class SuggestQueryDto {
  @ApiProperty({ example: 'balu', minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;
}

export class CategorySuggestionDto {
  @ApiProperty({ example: 'baluchori' }) slug!: string;
  @ApiProperty({ example: 'Baluchori' }) name!: string;
}

export class SearchSuggestionsDto {
  @ApiProperty({ type: CategorySuggestionDto, isArray: true }) categories!: CategorySuggestionDto[];
  @ApiProperty({ type: PublicProductCardDto, isArray: true }) products!: PublicProductCardDto[];
  /** All products matching the query (for "See all N results"). */
  @ApiProperty() total!: number;
}
