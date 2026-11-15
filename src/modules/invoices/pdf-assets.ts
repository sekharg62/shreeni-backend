import { readFileSync } from 'node:fs';

/** The storefront header logo (PNG copy, 520×226; PDFs can't embed WebP). Copied into dist/ by nest-cli. */
const LOGO_URL = new URL('./assets/logo.png', import.meta.url);
/** Width ÷ height of the logo. */
export const LOGO_RATIO = 520 / 226;

let logo: Buffer | null | undefined;

/** Read once; null if it's missing (callers then print the brand name instead). */
export function logoImage(): Buffer | null {
  if (logo === undefined) {
    try {
      logo = readFileSync(LOGO_URL);
    } catch {
      logo = null;
    }
  }
  return logo;
}
