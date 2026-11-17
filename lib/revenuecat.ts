const REVENUECAT_API_URL = "https://api.revenuecat.com/v1/subscribers";

export type ProStatus = {
  isPro: boolean;
  expiresAt: Date | null;
};

// Premium = fitur offline. Online = sinkronisasi + scan tanpa batas.
// Produk Langganan memberi kedua entitlement; Sekali Bayar hanya premium.
export const entitlementId =
  process.env.REVENUECAT_ENTITLEMENT_ID ?? "pro_access_kasirai";
export const onlineEntitlementId =
  process.env.REVENUECAT_ENTITLEMENT_ONLINE_ID ?? "pro_online_kasirai";

async function checkEntitlement(email: string, entitlement: string): Promise<ProStatus | null> {
  const secret = process.env.REVENUECAT_SECRET_KEY;
  if (!secret || !email) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${REVENUECAT_API_URL}/${encodeURIComponent(email)}`, {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (response.status === 404) return { isPro: false, expiresAt: null };
    if (!response.ok) return null;

    const data = (await response.json()) as {
      subscriber?: {
        entitlements?: Record<string, { expires_date?: string | null } | undefined>;
      };
    };

    const item = data.subscriber?.entitlements?.[entitlement];
    if (!item) return { isPro: false, expiresAt: null };

    const expiresAt = item.expires_date ? new Date(item.expires_date) : null;
    const isPro = !expiresAt || expiresAt.getTime() > Date.now();

    return { isPro, expiresAt };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Cek entitlement premium offline. */
export async function checkRevenueCatPro(email: string): Promise<ProStatus | null> {
  return checkEntitlement(email, entitlementId);
}

/** Cek entitlement online (Langganan). */
export async function checkRevenueCatOnline(email: string): Promise<ProStatus | null> {
  return checkEntitlement(email, onlineEntitlementId);
}

export function isEntitlementActive(proActive: boolean, proExpiresAt: Date | null) {
  if (!proActive) return false;
  return !proExpiresAt || proExpiresAt.getTime() > Date.now();
}
