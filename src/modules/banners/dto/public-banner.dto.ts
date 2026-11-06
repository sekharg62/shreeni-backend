import { ApiProperty } from '@nestjs/swagger';

/**
 * What the storefront gets for one banner — display fields only.
 * No id, status, sort order or timestamps: the list is already filtered and ordered.
 */
export class PublicBannerDto {
  @ApiProperty({ type: String, nullable: true, example: 'Kantha Stitch' })
  title!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Hand-embroidered by Bengal artisans' })
  subtitle!: string | null;

  @ApiProperty({ example: 'https://shreeni-collection.s3.ap-south-1.amazonaws.com/banners/abc.webp' })
  imageUrl!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Separate crop for small screens' })
  mobileImageUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '/sarees/kantha-stitch' })
  linkUrl!: string | null;
}
