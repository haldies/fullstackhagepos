import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");

  if (!email) {
    console.error("Pakai: pnpm admin:grant <email> [--revoke]");
    process.exit(1);
  }

  const account = await prisma.account.findUnique({ where: { email } });
  if (!account) {
    console.error(`Akun ${email} belum ada. Login dulu di dashboard dengan Google.`);
    process.exit(1);
  }

  await prisma.account.update({
    where: { id: account.id },
    data: { isPlatformAdmin: !revoke },
  });

  console.log(`${email} ${revoke ? "bukan lagi" : "sekarang"} platform admin.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
