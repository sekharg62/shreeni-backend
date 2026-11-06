import { randomUUID } from 'node:crypto';

/**
 * Where each kind of image lives in the bucket. Decided by the backend only —
 * the route that's called determines the folder, never the client.
 *
 *   banners/{uuid}.webp
 *   categories/{categoryId}/banner-{uuid}.webp
 *   categories/{categoryId}/poster-{uuid}.webp
 *   products/{productId}/{uuid}.webp
 */
export const ImagePaths = {
  banner: () => `banners/${randomUUID()}.webp`,
  categoryBanner: (categoryId: string) => `categories/${categoryId}/banner-${randomUUID()}.webp`,
  categoryPoster: (categoryId: string) => `categories/${categoryId}/poster-${randomUUID()}.webp`,
  product: (productId: string) => `products/${productId}/${randomUUID()}.webp`,
} as const;

/** Max width per image kind (images are never enlarged). */
export const MAX_WIDTH = {
  banner: 1920,
  category: 1600,
  product: 1600,
} as const;

/** Upload limits (input size — files shrink a lot after WebP conversion). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_FILES_PER_REQUEST = 10;

/** Multer options shared by every image upload route. */
export const IMAGE_UPLOAD_LIMITS = {
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES_PER_REQUEST },
};
