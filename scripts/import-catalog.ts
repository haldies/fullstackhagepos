import "dotenv/config";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

const rowSchema = z.object({
  nama_produk: z.string(),
  sku: z.string(),
  merek: z.string().nullable().optional(),
  kategori: z.string().nullable().optional(),
  harga: z.number().finite(),
});

const fileSchema = z.array(rowSchema);

type CatalogRow = {
  sku: string;
  skuKey: string;
  name: string;
  brand: string | null;
  category: string | null;
  price: number;
};

const CHUNK_SIZE = 500;

const clean = (value?: string | null) => {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

async function main() {
  const filePath = path.resolve(process.argv[2] ?? "all_data_products_pabrik.json");
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  const parsed = fileSchema.safeParse(raw);

  if (!parsed.success) {
    console.error("Format JSON tidak valid:");
    console.error(parsed.error.issues.slice(0, 5));
    process.exit(1);
  }

  const rowsBySku = new Map<string, CatalogRow>();
  const duplicateSamples: string[] = [];
  let skippedEmpty = 0;
  let duplicateSku = 0;
  let zeroPrice = 0;

  for (const row of parsed.data) {
    const sku = row.sku.trim();
    const name = row.nama_produk.trim();
    const skuKey = sku.toUpperCase();

    if (!sku || !name) {
      skippedEmpty += 1;
      continue;
    }

    if (rowsBySku.has(skuKey)) {
      duplicateSku += 1;
      if (duplicateSamples.length < 10) duplicateSamples.push(sku);
      continue;
    }

    const price = Math.max(0, Math.round(row.harga));
    if (price === 0) zeroPrice += 1;

    rowsBySku.set(skuKey, {
      sku,
      skuKey,
      name,
      brand: clean(row.merek),
      category: clean(row.kategori),
      price,
    });
  }

  const rows = Array.from(rowsBySku.values());
  console.log(`File       : ${filePath}`);
  console.log(`Dibaca     : ${parsed.data.length}`);
  console.log(`Unik       : ${rows.length}`);
  console.log(`Duplikat   : ${duplicateSku} (dilewati)`);
  if (duplicateSamples.length > 0) {
    console.log(`  contoh   : ${duplicateSamples.join(", ")}`);
  }
  console.log(`Kosong     : ${skippedEmpty} (dilewati)`);
  console.log(`Harga 0    : ${zeroPrice}`);
  console.log("Mengimpor ke database...");

  let processed = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const values = chunk.map(
      (row) => Prisma.sql`(
        ${randomUUID()},
        ${row.sku},
        ${row.skuKey},
        ${row.name},
        ${row.brand},
        ${row.category},
        ${row.price},
        NOW(),
        NOW()
      )`,
    );

    await prisma.$executeRaw`
      INSERT INTO "CatalogProduct" ("id", "sku", "skuKey", "name", "brand", "category", "price", "createdAt", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("skuKey")
      DO UPDATE SET
        "sku" = EXCLUDED."sku",
        "name" = EXCLUDED."name",
        "brand" = EXCLUDED."brand",
        "category" = EXCLUDED."category",
        "price" = EXCLUDED."price",
        "updatedAt" = NOW()
    `;

    processed += chunk.length;
    console.log(`  ${processed}/${rows.length}`);
  }

  const total = await prisma.catalogProduct.count();
  console.log(`Selesai. Total produk katalog di database: ${total}`);
}

main()
  .catch((err) => {
    console.error("IMPOR GAGAL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
