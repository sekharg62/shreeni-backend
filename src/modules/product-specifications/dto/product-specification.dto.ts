import { PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { SpecGroup } from '../../../generated/prisma/enums.js';

export class CreateProductSpecificationDto {
  /** DETAILS (fabric, length…) or MANUFACTURING (origin, packer…). */
  @IsEnum(SpecGroup)
  group!: SpecGroup;

  /** e.g. "Wash Care" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  /** e.g. "Dry Wash" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  value!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ReplaceProductSpecificationDto extends CreateProductSpecificationDto {}

export class UpdateProductSpecificationDto extends PartialType(
  CreateProductSpecificationDto,
) {}
