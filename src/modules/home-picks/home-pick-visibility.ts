import type { CatalogStatus } from '../../generated/prisma/enums.js';

/** Most picks the admin can keep in the list (the homepage shows the first few live ones). */
export const MAX_HOME_PICKS = 24;

/** Why a pick isn't on the homepage right now; null = it's live. */
export type HiddenReason =
  | 'switched-off'
  | 'scheduled'
  | 'ended'
  | 'product-unpublished'
  | 'category-unpublished'
  | 'out-of-stock';

export type VisibilityInput = {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  productStatus: CatalogStatus;
  categoryStatus: CatalogStatus;
  inStock: boolean;
};

/**
 * The one rule for "is this pick on the homepage now?". The public list and the admin list
 * both use it, so the admin always sees exactly what shoppers see. First failing check wins,
 * in the order an admin would fix them.
 */
export function hiddenReason(p: VisibilityInput, now: Date): HiddenReason | null {
  if (!p.isActive) return 'switched-off';
  if (p.startsAt && p.startsAt > now) return 'scheduled';
  if (p.endsAt && p.endsAt <= now) return 'ended';
  if (p.productStatus !== 'PUBLISHED') return 'product-unpublished';
  if (p.categoryStatus !== 'PUBLISHED') return 'category-unpublished';
  if (!p.inStock) return 'out-of-stock';
  return null;
}
