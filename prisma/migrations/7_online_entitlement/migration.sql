-- Pisahkan akses offline (sekali bayar) dan online (langganan).
ALTER TABLE "Account" ADD COLUMN "onlineActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Account" ADD COLUMN "onlineExpiresAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "onlineCheckedAt" TIMESTAMP(3);
