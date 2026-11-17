import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");
  const online = process.argv.includes("--online");

  if (!email) {
    console.error("Pakai: pnpm pro:grant <email> [--online] [--revoke]");
    process.exit(1);
  }

  const account = await prisma.account.findUnique({ where: { email } });
  if (!account) {
    console.error(`Akun ${email} belum ada. Login dulu di aplikasi.`);
    process.exit(1);
  }

  await prisma.account.update({
    where: { id: account.id },
    data: online
      ? {
          onlineActive: !revoke,
          onlineExpiresAt: null,
          onlineCheckedAt: new Date(),
          ...(revoke
            ? {}
            : {
                proActive: true,
                proExpiresAt: null,
                proCheckedAt: new Date(),
              }),
        }
      : {
          proActive: !revoke,
          proExpiresAt: null,
          proCheckedAt: new Date(),
        },
  });

  console.log(`${email} ${revoke ? "bukan lagi" : "sekarang"} ${online ? "Langganan" : "Sekali Bayar"}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
