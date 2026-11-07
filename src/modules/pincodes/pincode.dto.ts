import { ApiProperty } from '@nestjs/swagger';

/** `GET /pincodes/:pincode` */
export class PincodeDto {
  @ApiProperty({ example: '743134' }) pincode!: string;
  /** null for the few PIN codes India Post lists without a district. */
  @ApiProperty({ type: String, nullable: true, example: '24 Paraganas North' }) district!: string | null;
  /** Same spelling as the address form's state list. */
  @ApiProperty({ example: 'West Bengal' }) state!: string;
}
