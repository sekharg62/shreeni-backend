import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** Thin wrapper over the S3 bucket: upload bytes, delete by URL. */
@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  /** Public URL prefix of the bucket, e.g. https://bucket.s3.ap-south-1.amazonaws.com */
  readonly publicBaseUrl: string;

  constructor(config: ConfigService) {
    const region = config.getOrThrow<string>('aws.region');
    this.bucket = config.getOrThrow<string>('aws.s3Bucket');
    this.publicBaseUrl = `https://${this.bucket}.s3.${region}.amazonaws.com`;
    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId: config.getOrThrow<string>('aws.accessKeyId'),
        secretAccessKey: config.getOrThrow<string>('aws.secretAccessKey'),
      },
    });
  }

  /** Uploads and returns the public URL. Keys are unique, so cache for a year. */
  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.urlFor(key);
  }

  urlFor(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  /** The object key for one of OUR URLs, or null for anything else (external/old URLs). */
  keyFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const prefix = `${this.publicBaseUrl}/`;
    if (!url.startsWith(prefix)) return null;
    const key = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
    return key || null;
  }

  /**
   * Deletes the file behind a URL if it lives in our bucket.
   * Never throws: the database is the source of truth, so a failed delete
   * is logged (and leaves a harmless orphan file) instead of failing the request.
   */
  async deleteByUrl(url: string | null | undefined): Promise<void> {
    const key = this.keyFromUrl(url);
    if (!key) return;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Could not delete s3://${this.bucket}/${key}: ${(err as Error).message}`);
    }
  }

  /** Strict delete by key — throws if S3 refuses (used where the caller must know). */
  async deleteKeyOrThrow(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deleteManyByUrl(urls: (string | null | undefined)[]): Promise<void> {
    await Promise.all(urls.map((u) => this.deleteByUrl(u)));
  }
}
