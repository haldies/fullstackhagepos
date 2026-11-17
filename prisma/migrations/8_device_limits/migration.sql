-- Batas device aktif dan riwayat pemindahan device.
ALTER TABLE "Store" ADD COLUMN "lastDeviceChangeAt" TIMESTAMP(3);
ALTER TABLE "Device" ADD COLUMN "deviceName" TEXT;
ALTER TABLE "Device" ADD COLUMN "revokedAt" TIMESTAMP(3);
CREATE INDEX "Device_storeId_revokedAt_idx" ON "Device"("storeId", "revokedAt");
