"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type GoogleCredentialResponse = { credential: string };

type LoginResponse = {
  account: { id: string; email: string; name: string | null; isPlatformAdmin: boolean };
};

type GoogleIdApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: { theme?: string; size?: string; text?: string; shape?: string; width?: number },
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const GSI_SCRIPT_ID = "google-gsi-script";

function loadGsiScript(onLoad: () => void, onError: () => void) {
  // Sudah termuat sebelumnya (mis. navigasi ulang)
  const existing = document.getElementById(GSI_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    if (window.google) onLoad();
    else {
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
    }
    return () => {
      existing.removeEventListener("load", onLoad);
      existing.removeEventListener("error", onError);
    };
  }

  const script = document.createElement("script");
  script.id = GSI_SCRIPT_ID;
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.onload = onLoad;
  script.onerror = onError;
  document.head.appendChild(script);

  return () => {
    script.removeEventListener("load", onLoad);
    script.removeEventListener("error", onError);
  };
}

export function LoginButton() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(() => typeof window !== "undefined" && Boolean(window.google));
  const [renderFailed, setRenderFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Muat script Google secara manual (lebih andal daripada next/script + preload)
  useEffect(() => {
    if (!clientId) return;
    const cleanup = loadGsiScript(
      () => setScriptReady(true),
      () => setError("Gagal memuat script Google. Periksa koneksi internet, lalu muat ulang halaman."),
    );
    return cleanup;
  }, [clientId]);

  useEffect(() => {
    if (!scriptReady || !clientId || !containerRef.current || !window.google) return;

    let cancelled = false;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        setError(null);
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: credential, client: "web" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Login gagal. Coba lagi.");
          return;
        }

        const { account } = (await res.json()) as LoginResponse;
        if (!account.isPlatformAdmin) {
          // Customer tidak memakai web — session dicabut, arahkan ke aplikasi.
          await fetch("/api/auth/logout", { method: "POST" });
          setError("Akun ini bukan admin. Silakan login lewat aplikasi KasirPro.");
          return;
        }

        router.replace("/admin");
        router.refresh();
      },
    });

    window.google.accounts.id.renderButton(containerRef.current, {
      theme: "filled_black",
      size: "large",
      text: "signin_with",
      shape: "pill",
      width: 280,
    });

    // Kalau tombol Google tidak dirender (mis. origin belum terotorisasi),
    // kasih pesan yang bisa ditindaklanjuti setelah beberapa detik.
    const timer = setTimeout(() => {
      if (cancelled) return;
      const rendered = containerRef.current?.querySelector("iframe, div[role=button], .nsm7Bb2xxrrr9bYdRT7bM");
      if (!rendered) setRenderFailed(true);
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scriptReady, clientId, router]);

  if (!clientId) {
    return (
      <p className="text-sm text-red-400">
        NEXT_PUBLIC_GOOGLE_CLIENT_ID belum diset di .env
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={containerRef} />
      {renderFailed && !error && (
        <p className="max-w-xs text-center text-xs text-amber-400">
          Tombol Google belum muncul. Kemungkinan origin domain belum terotorisasi
          di Google Cloud Console (tunggu 5–30 menit setelah edit), lalu muat ulang halaman.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
