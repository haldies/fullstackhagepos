import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatIdr } from "@/lib/format";
import { daysAgo } from "@/lib/time";
import { AdminStoreActions } from "@/components/admin-store-actions";

type Props = { params: Promise<{ id: string }> };

function StoreDetailSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-white/5" />
      <div className="h-28 animate-pulse rounded-2xl border border-white/10 bg-zinc-900" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-zinc-900" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl border border-white/10 bg-zinc-900" />
    </div>
  );
}

async function StoreDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id: storeId } = await params;
  const since = daysAgo(30);

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { owner: { select: { id: true, email: true, name: true } } },
  });
  if (!store) notFound();

  const [devices, memberCounts, txRows, auditRows] = await Promise.all([
    prisma.device.findMany({
      where: { storeId },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, platform: true, appVersion: true, lastSeenAt: true },
    }),
    prisma.storeMember.groupBy({ by: ["role"], where: { storeId }, _count: { _all: true } }),
    prisma.syncEntity.findMany({
      where: { storeId, kind: "transaction", deletedAt: null, updatedAt: { gte: since } },
      select: { data: true },
    }),
    prisma.auditLog.findMany({
      where: { targetType: "store", targetId: storeId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  // Agregat saja: isi item, pelanggan, dan detail transaksi tidak ditampilkan.
  let paidCount = 0;
  let revenue = 0;
  let cost = 0;
  for (const row of txRows) {
    const tx = row.data as { status?: string; total?: number; totalCost?: number };
    if (tx.status !== "Paid") continue;
    paidCount++;
    revenue += Number(tx.total ?? 0);
    cost += Number(tx.totalCost ?? 0);
  }

  const actorIds = [...new Set(auditRows.map((a) => a.actorId))];
  const actors = await prisma.account.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, email: true },
  });
  const actorEmail = new Map(actors.map((a) => [a.id, a.email]));

  const ownerCount = memberCounts.find((m) => m.role === "OWNER")?._count._all ?? 0;
  const cashierCount = memberCounts.find((m) => m.role === "CASHIER")?._count._all ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{store.name}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            store.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
          }`}
        >
          {store.status === "ACTIVE" ? "Aktif" : "Ditangguhkan"}
        </span>
      </div>
      <p className="text-sm text-zinc-400">
        Owner: {store.owner.email} · {ownerCount} owner, {cashierCount} kasir · Dibuat{" "}
        {formatDateTime(store.createdAt)}
      </p>

      <AdminStoreActions storeId={store.id} status={store.status} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Transaksi lunas (30 hari)</p>
          <p className="mt-2 text-2xl font-semibold">{paidCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Omzet (30 hari)</p>
          <p className="mt-2 text-2xl font-semibold">{formatIdr(revenue)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Laba kotor (30 hari)</p>
          <p className="mt-2 text-2xl font-semibold">{formatIdr(revenue - cost)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
        <h2 className="font-medium">Device</h2>
        {devices.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">Belum ada device yang mengirim heartbeat.</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="pb-3 font-medium">Platform</th>
                <th className="pb-3 font-medium">Versi app</th>
                <th className="pb-3 font-medium">Terakhir terlihat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {devices.map((d) => (
                <tr key={d.id}>
                  <td className="py-3 capitalize text-zinc-300">{d.platform}</td>
                  <td className="py-3 text-zinc-300">{d.appVersion}</td>
                  <td className="py-3 text-zinc-400">{formatDateTime(d.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
        <h2 className="font-medium">Riwayat aksi admin</h2>
        {auditRows.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">Belum ada aksi.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5 text-sm">
            {auditRows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-zinc-200">{a.action}</p>
                  <p className="text-xs text-zinc-500">
                    oleh {actorEmail.get(a.actorId) ?? "admin"} · {a.meta ? JSON.stringify(a.meta) : ""}
                  </p>
                </div>
                <span className="text-xs text-zinc-500">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminStoreDetailPage({ params }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/stores" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Kembali ke daftar toko
        </Link>
      </div>

      <Suspense fallback={<StoreDetailSkeleton />}>
        <StoreDetail params={params} />
      </Suspense>
    </div>
  );
}
