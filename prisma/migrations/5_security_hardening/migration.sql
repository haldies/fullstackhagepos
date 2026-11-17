-- Hapus entity lama yang berisi PIN kasir plaintext.
DELETE FROM "SyncEntity" WHERE "kind" = 'setting' AND "clientId" = 'cashiers';

-- RLS untuk tabel internal Prisma (sebelumnya terbuka via PostgREST).
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Role aplikasi (kasirpro_app) hanya boleh lewat policy khusus; role
-- PostgREST (anon/authenticated) tetap tidak punya akses.
DO $$
DECLARE
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kasirpro_app') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'Account', 'AuditLog', 'CatalogProduct', 'Device', 'Session',
      'Store', 'StoreMember', 'StoreInvite', 'SyncEntity'
    ]
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS kasirpro_app_all ON %I', table_name);
      EXECUTE format(
        'CREATE POLICY kasirpro_app_all ON %I FOR ALL TO kasirpro_app USING (true) WITH CHECK (true)',
        table_name
      );
    END LOOP;
  END IF;
END
$$;

-- Backend memakai koneksi Prisma langsung (role postgres), jadi role
-- PostgREST tidak perlu akses apa pun ke tabel aplikasi.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

-- Pastikan tabel baru juga tidak otomatis diberi akses ke anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- Index untuk query store berdasarkan owner.
CREATE INDEX "Store_ownerId_idx" ON "Store"("ownerId");
