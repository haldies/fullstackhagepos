-- Manajemen akses online: PIN staff dan izin menu disimpan di server.
ALTER TABLE "Store" ADD COLUMN "accessManagementEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreMember" ADD COLUMN "staffUsername" TEXT;
ALTER TABLE "StoreMember" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "StoreMember" ADD COLUMN "lockedFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "StoreMember" ADD COLUMN "accessEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StoreMember" ADD COLUMN "lastPinChangedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "StoreMember_storeId_staffUsername_key" ON "StoreMember"("storeId", "staffUsername");
