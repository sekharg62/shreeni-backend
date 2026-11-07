-- Cart lines are always one size of a product. The table was unused before this,
-- but drop any size-less rows first so NOT NULL can be applied safely.
DELETE FROM "CartItem" WHERE "variantId" IS NULL;
-- Keep only the newest line per (cart, size) so the new unique index can be created.
DELETE FROM "CartItem" a USING "CartItem" b
WHERE a."cartId" = b."cartId" AND a."variantId" = b."variantId" AND a."createdAt" < b."createdAt";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_variantId_fkey";

-- DropIndex
DROP INDEX "CartItem_cartId_productId_variantId_key";

-- AlterTable
ALTER TABLE "CartItem" ALTER COLUMN "variantId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

