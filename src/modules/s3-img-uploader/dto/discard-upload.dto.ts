import { IsUrl } from 'class-validator';

/** DELETE /admin/uploads — discard an uploaded file that was never saved on a record. */
export class DiscardUploadDto {
  /** The `url` returned by an upload, e.g. https://<bucket>.s3.<region>.amazonaws.com/banners/<uuid>.webp */
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  url!: string;
}
