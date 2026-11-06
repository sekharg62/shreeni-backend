import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class LinkProductTagDto {
  @IsUUID('all')
  tagId!: string;
}

/** Replace the product's tags with exactly this list ([] removes all). */
export class SetProductTagsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tagIds!: string[];
}
