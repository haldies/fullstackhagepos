"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
    >
      {loading ? "Keluar..." : "Keluar"}
    </button>
  );
}
