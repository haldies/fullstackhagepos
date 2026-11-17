import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrasi memakai role admin terpisah; runtime aplikasi memakai DATABASE_URL
    // dengan role DML saja (kasirpro_app).
    url: process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL,
  },
});
