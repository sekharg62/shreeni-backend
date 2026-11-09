import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Blank text → null, so clearing the field in the admin removes the badge. */
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

/** `POST /admin/home-picks` — add a product to the end of the list. */
export class CreateHomePickDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  productId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 30,
    example: 'Customer favourite',
    description: 'Ribbon on the card. Null or blank = none.',
  })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(30)
  badge?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** ISO date-time, e.g. "2026-11-01T00:00:00+05:30". Null = from now. */
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  /** Null = no end. */
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}

/** `PATCH /admin/home-picks/:id` — badge, on/off, schedule. Send null to clear a field. */
export class UpdateHomePickDto extends PartialType(OmitType(CreateHomePickDto, ['productId'] as const)) {}

/** The product a pick points to, as the admin list shows it. Prices in paise. */
export class HomePickProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] }) status!: string;
  @ApiProperty() categoryName!: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty() price!: number;
  @ApiProperty({ type: Number, nullable: true }) compareAtPrice!: number | null;
  @ApiProperty() inStock!: boolean;
}

/** One row of the admin list, with whether (and why not) it's on the homepage right now. */
export class HomePickDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) badge!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) startsAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) endsAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ type: HomePickProductDto }) product!: HomePickProductDto;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['switched-off', 'scheduled', 'ended', 'product-unpublished', 'category-unpublished', 'out-of-stock'],
    description: 'Why it is not on the homepage now; null = live',
  })
  hiddenReason!: string | null;
}
