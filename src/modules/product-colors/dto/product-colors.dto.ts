import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/** Sets a product's colors. Omit / null secondaryColorId to have none. */
export class SetProductColorsDto {
  @IsUUID('all')
  primaryColorId!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID('all')
  secondaryColorId?: string | null;
}
