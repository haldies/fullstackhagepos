export const formatIdr = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export const formatDateTime = (value: Date | string | null) =>
  value ? new Date(value).toLocaleString("id-ID") : "-";
