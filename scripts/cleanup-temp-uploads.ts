import "dotenv/config";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type _Object,
} from "@aws-sdk/client-s3";
import { R2_BUCKET, r2 } from "../lib/r2";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

async function main() {
  const cutoff = Date.now() - MAX_AGE_MS;
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const page = await r2.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: "tmp/",
        MaxKeys: PAGE_SIZE,
        ContinuationToken: continuationToken,
      }),
    );

    const oldObjects = (page.Contents ?? []).filter(
      (object): object is _Object & { Key: string } =>
        Boolean(object.Key) && Boolean(object.LastModified) && object.LastModified!.getTime() < cutoff,
    );

    if (oldObjects.length > 0) {
      await r2.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: oldObjects.map((object) => ({ Key: object.Key })) },
        }),
      );
      deleted += oldObjects.length;
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`Selesai. ${deleted} file temp lebih dari 24 jam dihapus.`);
}

main().catch((err) => {
  console.error("Gagal membersihkan file temp R2:", err);
  process.exit(1);
});
