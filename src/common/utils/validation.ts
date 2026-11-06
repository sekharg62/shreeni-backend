/** lowercase words joined by single hyphens, e.g. "banarasi-silk" */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MESSAGE =
  'slug must be lowercase letters/numbers separated by hyphens (e.g. "banarasi-silk")';

/** #rgb or #rrggbb */
export const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const HEX_COLOR_MESSAGE = 'must be a hex color like "#b88646"';
