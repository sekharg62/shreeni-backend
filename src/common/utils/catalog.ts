import { BadRequestException } from '@nestjs/common';
import type { CatalogStatus } from '../../generated/prisma/enums.js';

/** "Banarasi Silk Saree!" → "banarasi-silk-saree" */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new BadRequestException('Could not build a slug — provide one explicitly.');
  }
  return slug;
}

/**
 * publishedAt is stamped the first time a record becomes PUBLISHED
 * and kept afterwards (so "New Arrivals" order doesn't jump on re-publish).
 */
export function nextPublishedAt(
  status: CatalogStatus | undefined,
  current: Date | null | undefined,
): Date | null | undefined {
  if (status === 'PUBLISHED' && !current) return new Date();
  return undefined; // leave unchanged
}

/** Assigns sortOrder = index for the given ids (used by reorder endpoints). */
export function reorderUpdates(ids: string[]) {
  return ids.map((id, index) => ({ id, sortOrder: index }));
}
