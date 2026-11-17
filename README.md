This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Katalog Produk Pabrik

Data katalog ada di `all_data_products_pabrik.json`. Impor ulang kapan saja (idempoten, SKU unik):

```bash
pnpm catalog:import
# atau dengan file lain
pnpm catalog:import path/ke/file.json
```

Endpoint lookup untuk aplikasi KasirPro:

```
GET /api/catalog/lookup?sku=8710459101242
```

Respons sukses: `{ "product": { "sku", "name", "brand", "category", "price" } }`.

## Keamanan

- **Admin platform** ditentukan oleh `ADMIN_EMAILS` (dipisah koma). Tidak ada lagi
  akun pertama otomatis menjadi admin.
- **Runtime DB memakai role DML terbatas**. Buat/update role:
  ```bash
  pnpm db:app-role
  ```
  `DATABASE_URL` = role `kasirpro_app`, `MIGRATE_DATABASE_URL` = role `postgres`
  (hanya untuk `prisma migrate`).
- **RLS + grant**: role `anon`/`authenticated` Supabase tidak punya akses ke tabel
  aplikasi. Jangan menambahkan policy RLS untuk role tersebut.
- **Upload gambar** memakai prefix `tmp/` lalu dipindahkan saat konfirmasi.
  Pasang lifecycle R2 untuk menghapus file yatim:
  ```bash
  pnpm r2:lifecycle
  ```
  Token R2 harus punya izin bucket lifecycle. Jika `AccessDenied`, atur rule
  manual di Cloudflare Dashboard: prefix `tmp/`, expire setelah 1 hari.
- **Rate limit** ada di kode, tetapi untuk produksi tetap pasang rate limit
  Cloudflare/WAF per IP untuk `/api/auth/*`, `/api/catalog/*`, `/api/sync/*`,
  `/api/uploads/*`, dan batas body request 1 MB.
- **Session**: cookie `__Host-kasir_session` (production), HttpOnly, Secure,
  SameSite=Strict, idle 7 hari / absolut 14 hari.
- **PIN kasir tidak lagi disinkronkan** ke cloud. Jangan menambahkan `cashiers`
  ke daftar setting sync.



## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
