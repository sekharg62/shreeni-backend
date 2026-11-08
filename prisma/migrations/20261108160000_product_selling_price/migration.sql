-- Store the price customers pay and the discount %, so the storefront can filter and sort on them.

-- 1. Add the columns (sellingPrice nullable until it is filled in).
ALTER TABLE "Product" ADD COLUMN "sellingPrice" INTEGER,
ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;

-- 2. Fill them for existing products (same rule as the API: the sale price only counts when lower).
UPDATE "Product"
SET "sellingPrice" = CASE
      WHEN "discountPrice" IS NOT NULL AND "discountPrice" < "originalPrice" THEN "discountPrice"
      ELSE "originalPrice"
    END;
UPDATE "Product"
SET "discountPercent" = CASE
      WHEN "originalPrice" > 0 AND "sellingPrice" < "originalPrice"
        THEN ROUND(("originalPrice" - "sellingPrice") * 100.0 / "originalPrice")::INTEGER
      ELSE 0
    END;

-- 3. Now every row has a value.
ALTER TABLE "Product" ALTER COLUMN "sellingPrice" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Product_categoryId_status_sellingPrice_idx" ON "Product"("categoryId", "status", "sellingPrice");

-- CreateIndex
CREATE INDEX "Product_categoryId_status_discountPercent_idx" ON "Product"("categoryId", "status", "discountPercent");
