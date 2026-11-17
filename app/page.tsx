import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentAccount } from "@/lib/session";

async function RootRedirect() {
  const account = await getCurrentAccount();
  redirect(account?.isPlatformAdmin ? "/admin" : "/login");
  return null;
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <RootRedirect />
    </Suspense>
  );
}
