import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { daysAgo } from "@/lib/time";

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="h-[112px] animate-pulse rounded-2xl border border-white/10 bg-zinc-900" />
      ))}
    </div>
  );
}

async function OverviewStats() {
  await connection();
  const d7 = daysAgo(7);
  const d30 = daysAgo(30);

  const [
    totalStores,
    suspendedStores,
    newAccounts30,
    activeDeviceStores7,
    syncedStores7,
  ] = await Promise.all([
    prisma.store.count(),
    prisma.store.count({ where: { status: "SUSPENDED" } }),
    prisma.account.count({ where: { createdAt: { gte: d30 } } }),
    prisma.device.findMany({
      where: { lastSeenAt: { gte: d7 } },
      distinct: ["storeId"],
      select: { storeId: true },
    }),
    prisma.syncEntity.findMany({
      where: { syncedAt: { gte: d7 } },
      distinct: ["storeId"],
      select: { storeId: true },
    }),
  ]);

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total toko" value={totalStores} hint={`${suspendedStores} ditangguhkan`} />
      <StatCard label="Toko aktif (7 hari)" value={activeDeviceStores7.length} hint="Ada heartbeat dari device" />
      <StatCard label="Toko sync (7 hari)" value={syncedStores7.length} hint="Ada data masuk dari app" />
      <StatCard label="Akun baru (30 hari)" value={newAccounts30} />
    </section>
  );
}

function VersionsSkeleton() {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
      <div className="h-5 w-48 animate-pulse rounded bg-white/10" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-white/5" />
        ))}
      </div>
    </section>
  );
}

async function AppVersions() {
  await connection();

  const versionGroups = await prisma.device.groupBy({
    by: ["platform", "appVersion"],
    where: { lastSeenAt: { gte: daysAgo(30) } },
    _count: { _all: true },
  });

  const versions = versionGroups
    .map((g) => ({ platform: g.platform, appVersion: g.appVersion, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
      <h2 className="font-medium">Versi aplikasi (device aktif 30 hari)</h2>
      {versions.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">Belum ada heartbeat dari device.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="pb-3 font-medium">Platform</th>
              <th className="pb-3 font-medium">Versi</th>
              <th className="pb-3 text-right font-medium">Device</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {versions.map((v) => (
              <tr key={`${v.platform}-${v.appVersion}`}>
                <td className="py-3 capitalize text-zinc-300">{v.platform}</td>
                <td className="py-3 text-zinc-300">{v.appVersion}</td>
                <td className="py-3 text-right text-zinc-300">{v.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function AdminOverviewPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ringkasan</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Data agregat seluruh toko. Tidak menampilkan data transaksi atau pelanggan.
        </p>
      </div>

      <Suspense fallback={<StatsSkeleton />}>
        <OverviewStats />
      </Suspense>

      <Suspense fallback={<VersionsSkeleton />}>
        <AppVersions />
      </Suspense>
    </div>
  );
}
