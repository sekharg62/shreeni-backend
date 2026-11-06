import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class LinkProductCollectionDto {
  @IsUUID('all')
  collectionId!: string;
}

/** Replace the product's collections with exactly this list ([] removes all). */
export class SetProductCollectionsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  collectionIds!: string[];
}
