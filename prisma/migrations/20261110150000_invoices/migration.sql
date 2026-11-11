-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "invoicedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "gstRate" INTEGER,
ADD COLUMN     "hsnCode" TEXT;

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "financialYear" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("financialYear")
);

