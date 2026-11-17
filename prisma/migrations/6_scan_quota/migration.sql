-- Kuota scan gratis & status langganan (RevenueCat) disimpan di server,
-- supaya limit tidak bisa diakali hanya dari aplikasi.
ALTER TABLE "Account" ADD COLUMN "scanCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Account" ADD COLUMN "proActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Account" ADD COLUMN "proExpiresAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "proCheckedAt" TIMESTAMP(3);
