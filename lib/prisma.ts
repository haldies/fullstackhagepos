import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: AppPrisma };

const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isConnectionError = (error: unknown) => {
  const code = (error as { code?: string })?.code ?? "";
  const message = (error as Error)?.message ?? "";

  if (["P1001", "P1002", "P1017", "P2024"].includes(code)) return true;
  return /Server has closed the connection|Connection terminated|ECONNRESET|EPIPE|Connection closed/i.test(
    message,
  );
};

function createClient() {
  const defaultPoolMax = process.env.VERCEL ? 1 : 10;
  const configuredPoolMax = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  const poolMax = Number.isFinite(configuredPoolMax) && configuredPoolMax > 0
    ? configuredPoolMax
    : defaultPoolMax;

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Vercel dapat menjalankan beberapa instance serverless. Supabase
    // session pooler hanya punya pool_size terbatas, jadi jangan membuka
    // banyak koneksi dari setiap instance.
    max: poolMax,
    idleTimeoutMillis: process.env.VERCEL ? 5000 : 15000,
    connectionTimeoutMillis: 15000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    application_name: "kasirpro-api",
  });

  // Supabase pooler dapat menutup koneksi idle. Jangan biarkan error ini
  // menjadi unhandled error di proses Node.
  pool.on("error", (error) => {
    console.error("[prisma] idle pool error:", error.message);
  });

  const base = new PrismaClient({ adapter: new PrismaPg(pool) });

  // Retry sekali untuk operasi baca saat pooler menutup koneksi.
  // Operasi tulis tidak di-retry otomatis untuk menghindari duplikasi data.
  return base.$extends({
    name: "retry-read-on-connection-close",
    query: {
      async $allOperations({ operation, args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (!READ_OPERATIONS.has(operation) || !isConnectionError(error)) {
            throw error;
          }
          await sleep(200);
          return query(args);
        }
      },
    },
  });
}

type AppPrisma = ReturnType<typeof createClient>;

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
