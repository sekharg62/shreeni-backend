import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export const MAX_WISHLIST_ITEMS = 100;

/** `POST /me/wishlist/merge`: items a guest saved before signing in. */
export class MergeWishlistDto {
  @ApiProperty({ type: String, format: 'uuid', isArray: true, maxItems: MAX_WISHLIST_ITEMS })
  @IsArray()
  @ArrayMaxSize(MAX_WISHLIST_ITEMS)
  @IsUUID('all', { each: true, message: 'Each product id must be a UUID' })
  productIds!: string[];
}
