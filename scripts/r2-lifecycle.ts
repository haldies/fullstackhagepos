import "dotenv/config";
import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  type LifecycleRule,
} from "@aws-sdk/client-s3";
import { R2_BUCKET, r2 } from "../lib/r2";

const RULE_ID = "kasirpro-expire-tmp-uploads";

async function main() {
  let existing: LifecycleRule[] = [];

  try {
    const current = await r2.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: R2_BUCKET }),
    );
    existing = current.Rules ?? [];
  } catch (err) {
    const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
    if (code !== "NoSuchLifecycleConfiguration") throw err;
  }

  const rules = existing.filter((rule) => rule.ID !== RULE_ID);
  rules.push({
    ID: RULE_ID,
    Status: "Enabled",
    Filter: { Prefix: "tmp/" },
    Expiration: { Days: 1 },
  });

  await r2.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: R2_BUCKET,
      LifecycleConfiguration: { Rules: rules },
    }),
  );

  console.log(`Lifecycle R2 aktif: object di prefix "tmp/" dihapus setelah 1 hari.`);
}

main().catch((err) => {
  console.error("Gagal memasang lifecycle R2:", err);
  process.exit(1);
});
