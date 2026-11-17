import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentAccount } from "@/lib/session";
import { LoginButton } from "@/components/login-button";

async function LoginCard() {
  const account = await getCurrentAccount();
  if (account?.isPlatformAdmin) redirect("/admin");

  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-8 text-center shadow-xl">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">
        🛠️
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">KasirPro Admin</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Dashboard web khusus developer. Customer login lewat aplikasi KasirPro.
      </p>
      <div className="mt-8">
        <LoginButton />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
