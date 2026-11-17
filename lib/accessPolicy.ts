/** Fitur yang otomatis dikunci untuk karyawan baru. Owner bisa membukanya
 * satu per satu dari Manajemen Akses. */
export const DEFAULT_CASHIER_LOCKED_FEATURES = [
  "products",
  "categories",
  "reports",
  "printer",
  "qris-settings",
  "store-profile",
  "members",
  "cart-settings",
  "transaction-void",
  "transaction-delete",
] as const;
