-- CreateTable
CREATE TABLE "State" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stateId" UUID NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pincode" (
    "id" UUID NOT NULL,
    "pincode" TEXT NOT NULL,
    "stateId" UUID NOT NULL,
    "districtId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pincode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "State_name_key" ON "State"("name");

-- CreateIndex
CREATE UNIQUE INDEX "District_stateId_name_key" ON "District"("stateId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Pincode_pincode_key" ON "Pincode"("pincode");

-- CreateIndex
CREATE INDEX "Pincode_stateId_idx" ON "Pincode"("stateId");

-- CreateIndex
CREATE INDEX "Pincode_districtId_idx" ON "Pincode"("districtId");

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pincode" ADD CONSTRAINT "Pincode_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pincode" ADD CONSTRAINT "Pincode_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

