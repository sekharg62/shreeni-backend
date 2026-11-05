/// <reference types="multer" />
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ImageFolder,
  UploadImageResponse,
} from './dto/upload-image.dto.js';

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class S3ImgUploaderService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Validates the image and returns where it is stored.
   *
   * TODO (real S3): replace the dummy URL with an actual upload, e.g.
   *   await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: file.buffer,
   *     ContentType: file.mimetype }));
   *   return `https://${Bucket}.s3.${region}.amazonaws.com/${key}`;
   * The validation, key and response shape stay the same.
   */
  uploadImage(
    file: Express.Multer.File | undefined,
    folder: ImageFolder = 'general',
  ): UploadImageResponse {
    if (!file) {
      throw new BadRequestException('An image file is required (field: "file").');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed.');
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller.');
    }

    const dummyUrl = this.config.get<string>('s3.dummyImageUrl');
    if (!dummyUrl) {
      throw new InternalServerErrorException(
        'S3_DUMMY_IMAGE_URL is not configured.',
      );
    }

    // The object key real S3 will use: folder/timestamp-safe-file-name
    const safeName = file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const key = `${folder}/${Date.now()}-${safeName}`;

    return {
      url: dummyUrl,
      key,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      folder,
    };
  }
}
