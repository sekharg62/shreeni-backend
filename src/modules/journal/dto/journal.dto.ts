import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { JournalStatus } from '../../../generated/prisma/enums.js';
import { SLUG_MESSAGE, SLUG_REGEX } from '../../../common/utils/validation.js';
import { ToBoolean } from '../../../common/dto/transforms.js';

const URL_OPTS = { require_tld: false, protocols: ['http', 'https'], require_protocol: true };
/** Blank text → null, so clearing a field in the admin removes the value. */
const blankToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

/* ───────────── Posts (admin) ───────────── */

export class CreateJournalPostDto {
  @ApiProperty({ maxLength: 150, example: 'How to care for a Baluchori silk saree' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title!: string;

  /** Optional: made from the title when left out. */
  @ApiPropertyOptional({ example: 'baluchori-silk-saree-care' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(300)
  excerpt?: string | null;

  /** Tiptap JSON document: { type: "doc", content: [...] } */
  @ApiProperty({ type: Object })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(blankToNull)
  @IsUrl(URL_OPTS)
  coverImageUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(200)
  coverAlt?: string | null;

  @ApiPropertyOptional({ enum: JournalStatus, default: JournalStatus.DRAFT })
  @IsOptional()
  @IsEnum(JournalStatus)
  status?: JournalStatus;

  /** When it goes (or went) live. Future = scheduled. Publishing without one uses "now". */
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ maxLength: 70 })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 170 })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(170)
  seoDescription?: string | null;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(80)
  focusKeyword?: string | null;

  /** Only when this article first appeared elsewhere. */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(blankToNull)
  @IsUrl(URL_OPTS)
  canonicalUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(blankToNull)
  @IsUrl(URL_OPTS)
  ogImageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noindex?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  authorId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  categoryId?: string | null;

  /** Tag names; new ones are created. */
  @ApiPropertyOptional({ type: [String], maxItems: 15 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  /** "Shop this story" products, in order. */
  @ApiPropertyOptional({ type: [String], maxItems: 12 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  productIds?: string[];
}

export class UpdateJournalPostDto extends PartialType(CreateJournalPostDto) {}

/** Admin list filter: "scheduled" = published with a future date. */
export const POST_FILTERS = ['draft', 'scheduled', 'published', 'archived'] as const;
export type PostFilter = (typeof POST_FILTERS)[number];

export class JournalPostQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(POST_FILTERS)
  status?: PostFilter;

  @IsOptional()
  @IsUUID('all')
  categoryId?: string;

  @IsOptional()
  @IsUUID('all')
  authorId?: string;
}

export class LinkTargetQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  q!: string;
}

/* ───────────── Categories & authors (admin) ───────────── */

export class JournalCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(170)
  seoDescription?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateJournalCategoryDto extends PartialType(JournalCategoryDto) {}

export class JournalAuthorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(80)
  role?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(600)
  bio?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsUrl(URL_OPTS)
  avatarUrl?: string | null;

  /** { instagram, x, linkedin, website } — URLs */
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string> | null;
}

export class UpdateJournalAuthorDto extends PartialType(JournalAuthorDto) {}

/* ───────────── Storefront ───────────── */

export class PublicJournalQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit: number = 12;

  @IsOptional()
  @IsString()
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  category?: string;

  @IsOptional()
  @IsString()
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  tag?: string;

  @IsOptional()
  @IsString()
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  author?: string;

  /** Only featured posts (the Journal home's hero). */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  featured?: boolean;
}

export class JournalSlugParamDto {
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: SLUG_MESSAGE })
  slug!: string;
}
