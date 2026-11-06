import { Transform } from 'class-transformer';

/** Query-string "true"/"false" → boolean (a plain Boolean cast would turn "false" into true). */
export const ToBoolean = () =>
  Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });

/** Trim + uppercase a string (e.g. coupon codes). */
export const ToUpperTrim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));
