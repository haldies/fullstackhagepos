"use client";

import { useState, useTransition } from "react";
import { revokeOwnerSessions, setStoreStatus } from "@/app/admin/actions";

type Props = {
  storeId: string;
  status: "ACTIVE" | "SUSPENDED";
};

export function AdminStoreActions({ storeId, status }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await fn();
      setMessage(result.ok ? success : (result.error ?? "Gagal"));
    });
  };

  const nextStatus = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
      <h2 className="font-medium">Aksi admin</h2>
      <p className="mt-1 text-sm text-zinc-400">Semua aksi dicatat di audit log.</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          onClick={() =>
            run(
              () => setStoreStatus(storeId, nextStatus),
              nextStatus === "SUSPENDED" ? "Toko ditangguhkan" : "Toko diaktifkan",
            )
          }
          className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 ${
            nextStatus === "SUSPENDED"
              ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
              : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          }`}
        >
          {nextStatus === "SUSPENDED" ? "Tangguhkan toko" : "Aktifkan toko"}
        </button>

        <button
          disabled={pending}
          onClick={() => {
            if (!confirm("Cabut semua session owner? Owner harus login ulang.")) return;
            run(() => revokeOwnerSessions(storeId), "Session owner dicabut");
          }}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50"
        >
          Cabut session owner
        </button>
      </div>

      {message && <p className="mt-4 text-sm text-zinc-300">{message}</p>}
    </section>
  );
}
