import { IsIn, IsOptional } from 'class-validator';

export const IMAGE_FOLDERS = [
  'products',
  'categories',
  'banners',
  'reviews',
  'general',
] as const;

export type ImageFolder = (typeof IMAGE_FOLDERS)[number];

/** Extra form fields sent alongside the `file` in the multipart request. */
export class UploadImageDto {
  @IsOptional()
  @IsIn(IMAGE_FOLDERS)
  folder?: ImageFolder;
}

/** Shape returned to the client after an upload. */
export interface UploadImageResponse {
  url: string;
  key: string;
  fileName: string;
  mimeType: string;
  size: number;
  folder: ImageFolder;
}
