import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
}

/**
 * Validates and optimises an uploaded image:
 * - decodes it for real (a renamed non-image is rejected)
 * - applies the camera's rotation, then strips all metadata (EXIF / GPS location)
 * - resizes down to maxWidth (never enlarges) and converts to WebP
 */
@Injectable()
export class ImageProcessorService {
  async toWebp(input: Buffer, maxWidth: number): Promise<ProcessedImage> {
    let pipeline: ReturnType<typeof sharp>;
    try {
      pipeline = sharp(input, { failOn: 'error' });
      const meta = await pipeline.metadata();
      if (!meta.width || !meta.height) throw new Error('no dimensions');
    } catch {
      throw new BadRequestException('The file is not a valid image.');
    }

    const { data, info } = await pipeline
      .rotate() // honour EXIF orientation before metadata is dropped
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    return { buffer: data, width: info.width, height: info.height, size: info.size };
  }
}
