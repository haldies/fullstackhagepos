import "dotenv/config";
import pg from "pg";

const role = process.env.APP_DB_ROLE ?? "kasirpro_app";
const password = process.env.APP_DB_PASSWORD ?? "";
const migrationUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;

if (password.length < 24) {
  console.error("APP_DB_PASSWORD wajib diisi (minimal 24 karakter).");
  process.exit(1);
}
if (!migrationUrl) {
  console.error("MIGRATE_DATABASE_URL belum diset.");
  process.exit(1);
}

async function main() {
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();

  try {
    const quotedRole = client.escapeIdentifier(role);
    const quotedPassword = client.escapeLiteral(password);
    const quotedDatabase = client.escapeIdentifier(client.database ?? "postgres");

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role.replace(/'/g, "''")}') THEN
          CREATE ROLE ${quotedRole};
        END IF;
      END
      $$;
    `);

    await client.query(
      `ALTER ROLE ${quotedRole} WITH LOGIN PASSWORD ${quotedPassword}`,
    );
    await client.query(`GRANT CONNECT ON DATABASE ${quotedDatabase} TO ${quotedRole}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM ${quotedRole}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quotedRole}`,
    );
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quotedRole}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedRole}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${quotedRole}`,
    );

    console.log(`Role aplikasi "${role}" siap (DML saja, tanpa DDL).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Gagal membuat role aplikasi:", err);
  process.exit(1);
});
