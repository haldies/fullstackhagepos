-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "skuKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_skuKey_key" ON "CatalogProduct"("skuKey");

-- CreateIndex
CREATE INDEX "CatalogProduct_brand_idx" ON "CatalogProduct"("brand");

-- CreateIndex
CREATE INDEX "CatalogProduct_category_idx" ON "CatalogProduct"("category");

-- EnableRowLevelSecurity
ALTER TABLE "public"."CatalogProduct" ENABLE ROW LEVEL SECURITY;
