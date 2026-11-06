import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class LinkRelatedProductDto {
  @IsUUID('all')
  relatedProductId!: string;
}

/** Replace the "you may also like" list with exactly these products ([] removes all). */
export class SetRelatedProductsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  relatedProductIds!: string[];
}
