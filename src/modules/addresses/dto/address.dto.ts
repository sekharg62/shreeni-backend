import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AddressLabel } from '../../../generated/prisma/enums.js';
import { PHONE_INPUT } from '../../auth/dto/customer-auth.dto.js';
import { INDIAN_STATES } from '../indian-states.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Blank optional text → undefined (so it is stored as null). */
const optional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/** `POST /me/addresses` */
export class CreateAddressDto {
  @ApiPropertyOptional({ enum: AddressLabel, default: AddressLabel.HOME })
  @IsOptional()
  @IsEnum(AddressLabel, { message: 'label must be HOME, WORK or OTHER' })
  label?: AddressLabel;

  @ApiProperty({ example: 'Priya Sen' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Enter the receiver's name" })
  @MaxLength(100)
  receiverName!: string;

  @ApiProperty({ example: '9876543210' })
  @Transform(trim)
  @Matches(PHONE_INPUT, { message: 'Enter a valid 10-digit mobile number' })
  receiverPhone!: string;

  @ApiProperty({ example: 'Flat 4B, Rose Apartments' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter the flat / house number and building' })
  @MaxLength(150)
  flatHouseNo!: string;

  @ApiPropertyOptional({ example: 'Salt Lake, Sector 5' })
  @Transform(optional)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  apartmentSector?: string;

  @ApiPropertyOptional({ example: 'Near City Centre' })
  @Transform(optional)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  landmark?: string;

  @ApiProperty({ example: 'Kolkata' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter the city' })
  @MaxLength(80)
  city!: string;

  @ApiProperty({ example: 'West Bengal', enum: INDIAN_STATES })
  @Transform(trim)
  @IsIn(INDIAN_STATES, { message: 'Choose a state' })
  state!: string;

  @ApiProperty({ example: '700091' })
  @Transform(trim)
  @Matches(/^[1-9]\d{5}$/, { message: 'Enter a valid 6-digit pincode' })
  pincode!: string;
}

/** `PATCH /me/addresses/:id` — any subset. */
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

/** An address as the customer sees it. */
export class AddressDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: AddressLabel }) label!: AddressLabel;
  @ApiProperty() receiverName!: string;
  @ApiProperty({ example: '+919876543210' }) receiverPhone!: string;
  @ApiProperty() flatHouseNo!: string;
  @ApiProperty({ type: String, nullable: true }) apartmentSector!: string | null;
  @ApiProperty({ type: String, nullable: true }) landmark!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiProperty() pincode!: string;
  @ApiProperty() country!: string;
  @ApiProperty() isDefault!: boolean;
}
