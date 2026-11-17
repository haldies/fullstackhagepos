import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";

function StoresTableSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-white/5" />
        ))}
      </div>
    </div>
  );
}

async function StoresTable() {
  const [stores, deviceMax, syncMax] = await Promise.all([
    prisma.store.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { email: true } },
        _count: { select: { members: true, devices: true } },
      },
    }),
    prisma.device.groupBy({ by: ["storeId"], _max: { lastSeenAt: true } }),
    prisma.syncEntity.groupBy({ by: ["storeId"], _max: { syncedAt: true } }),
  ]);

  const lastDevice = new Map(deviceMax.map((r) => [r.storeId, r._max.lastSeenAt]));
  const lastSync = new Map(syncMax.map((r) => [r.storeId, r._max.syncedAt]));

  return (
    <>
      <p className="mt-1 text-sm text-zinc-400">{stores.length} toko terdaftar</p>

      {stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-zinc-400">
          Belum ada toko.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Toko</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Heartbeat terakhir</th>
                <th className="px-4 py-3 font-medium">Sync terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {stores.map((s) => (
                <tr key={s.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/stores/${s.id}`} className="font-medium text-emerald-400 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{s.owner.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        s.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {s.status === "ACTIVE" ? "Aktif" : "Ditangguhkan"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{s._count.devices}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatDateTime(lastDevice.get(s.id) ?? null)}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatDateTime(lastSync.get(s.id) ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function AdminStoresPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Toko</h1>
      </div>

      <Suspense fallback={<StoresTableSkeleton />}>
        <StoresTable />
      </Suspense>
    </div>
  );
}
