/// <reference types="multer" />
import { BadRequestException, Injectable } from '@nestjs/common';
import { ImageProcessorService } from './image-processor.service.js';
import { S3StorageService } from './s3-storage.service.js';
import { MAX_UPLOAD_BYTES } from './image-paths.js';

export interface UploadedImage {
  url: string;
  key: string;
  width: number;
  height: number;
  /** Size after WebP conversion, in bytes. */
  size: number;
  /** Size of the file that was sent, in bytes. */
  originalSize: number;
}

/** Validate → optimise → upload. Used by every image route (products, categories, banners). */
@Injectable()
export class ImageUploadService {
  constructor(
    private readonly processor: ImageProcessorService,
    private readonly storage: S3StorageService,
  ) {}

  async uploadImage(
    file: Express.Multer.File | undefined,
    key: string,
    maxWidth: number,
  ): Promise<UploadedImage> {
    if (!file) {
      throw new BadRequestException('An image file is required (form field "file").');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException(`"${file.originalname}" is not an image.`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`"${file.originalname}" is larger than 10 MB.`);
    }

    const image = await this.processor.toWebp(file.buffer, maxWidth);
    const url = await this.storage.upload(key, image.buffer, 'image/webp');
    return {
      url,
      key,
      width: image.width,
      height: image.height,
      size: image.size,
      originalSize: file.size,
    };
  }

  /**
   * Uploads several images. Every file is processed first, so one bad file
   * rejects the whole request before anything reaches S3.
   */
  async uploadImages(
    files: Express.Multer.File[] | undefined,
    keyFor: () => string,
    maxWidth: number,
  ): Promise<UploadedImage[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one image is required (form field "files").');
    }
    for (const f of files) {
      if (!f.mimetype.startsWith('image/')) {
        throw new BadRequestException(`"${f.originalname}" is not an image.`);
      }
    }
    const processed = await Promise.all(
      files.map(async (f) => ({ file: f, image: await this.processor.toWebp(f.buffer, maxWidth) })),
    );

    const uploaded: UploadedImage[] = [];
    try {
      for (const { file, image } of processed) {
        const key = keyFor();
        const url = await this.storage.upload(key, image.buffer, 'image/webp');
        uploaded.push({ url, key, width: image.width, height: image.height, size: image.size, originalSize: file.size });
      }
    } catch (err) {
      // Partial failure: remove what was already uploaded, then report the error.
      await this.storage.deleteManyByUrl(uploaded.map((u) => u.url));
      throw err;
    }
    return uploaded;
  }
}
