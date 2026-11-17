import Link from "next/link";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentAccount } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";

async function AccountChip() {
  const account = await getCurrentAccount();
  if (!account?.isPlatformAdmin) return null;

  return (
    <p className="hidden text-sm text-zinc-400 sm:block">{account.email}</p>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (!account.isPlatformAdmin) notFound();
  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2 font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">🛠️</span>
              KasirPro Admin
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-400">
              <Link href="/admin" className="hover:text-zinc-100">Ringkasan</Link>
              <Link href="/admin/stores" className="hover:text-zinc-100">Toko</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Suspense fallback={null}>
              <AccountChip />
            </Suspense>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Suspense
          fallback={
            <div className="h-96 animate-pulse rounded-2xl border border-white/10 bg-zinc-900" />
          }
        >
          <AdminGate>{children}</AdminGate>
        </Suspense>
      </main>
    </div>
  );
}
