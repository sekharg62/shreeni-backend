/**
 * Stored copies of the price a customer pays and the discount %, kept in sync on every product
 * write so the storefront can filter and sort by them. Same rule as the public API's `pricing()`:
 * the sale price only counts when it is lower than the original price.
 */
export function derivedPrices(originalPrice: number, discountPrice: number | null | undefined) {
  const onSale = discountPrice != null && discountPrice < originalPrice;
  const sellingPrice = onSale ? discountPrice : originalPrice;
  const discountPercent = onSale && originalPrice > 0 ? Math.round(((originalPrice - sellingPrice) * 100) / originalPrice) : 0;
  return { sellingPrice, discountPercent };
}
