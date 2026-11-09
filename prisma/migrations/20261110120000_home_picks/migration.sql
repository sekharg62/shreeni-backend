-- CreateTable
CREATE TABLE "HomePick" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "badge" VARCHAR(30),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomePick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HomePick_productId_key" ON "HomePick"("productId");

-- CreateIndex
CREATE INDEX "HomePick_isActive_sortOrder_idx" ON "HomePick"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "HomePick" ADD CONSTRAINT "HomePick_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
