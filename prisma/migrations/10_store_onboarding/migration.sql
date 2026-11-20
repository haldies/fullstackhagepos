-- Simpan jawaban onboarding per toko agar tidak hanya ada di HP.
ALTER TABLE "Store" ADD COLUMN "businessType" TEXT;
ALTER TABLE "Store" ADD COLUMN "monthlyRevenue" TEXT;
ALTER TABLE "Store" ADD COLUMN "mainProblem" TEXT;
ALTER TABLE "Store" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
