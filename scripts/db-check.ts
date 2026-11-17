import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const [accounts, stores, sessions] = await Promise.all([
    prisma.account.count(),
    prisma.store.count(),
    prisma.session.count(),
  ]);
  console.log(`DB OK — accounts: ${accounts}, stores: ${stores}, sessions: ${sessions}`);
}

main()
  .catch((err) => {
    console.error("DB GAGAL:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
