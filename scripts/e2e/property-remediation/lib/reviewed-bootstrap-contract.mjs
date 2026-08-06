import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OFFICIAL_POSTGRES_IMAGE } from "../bootstrap/ephemeral-postgres.mjs";

export const REVIEWED_BOOTSTRAP_SHA256 =
  "b734460703f061feecd5a4fac60a6ee8aad9771cd4ea4a9413d2fa60d27f6268";
export const REVIEWED_MIGRATION_175_SHA256 =
  "5daaca3cb4a48b40c258446c36427c49ad657bd4d95de388ca9661c3cd52c89c";
export const REVIEWED_BOOTSTRAP_CONTRACT_VERSION =
  "A-ephemeral-db-bootstrap-v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function migrationNumber(filename) {
  const match = filename.match(/^(\d{6})_.+\.sql$/);
  return match ? Number(match[1]) : null;
}

function expectedCount(number) {
  if (number >= 1 && number <= 183) return number === 136 ? 2 : 1;
  return 0;
}

export function loadReviewedBootstrapContract(
  migrationsDir = resolve("database/migrations")
) {
  const files = readdirSync(migrationsDir)
    .filter((filename) => {
      const number = migrationNumber(filename);
      return number !== null && number >= 1 && number <= 183;
    })
    .sort();
  const counts = new Map();
  for (const filename of files) {
    const number = migrationNumber(filename);
    counts.set(number, (counts.get(number) ?? 0) + 1);
  }
  for (let number = 1; number <= 183; number += 1) {
    const actual = counts.get(number) ?? 0;
    const expected = expectedCount(number);
    if (actual !== expected) {
      throw new Error(
        `reviewed bootstrap migration ${String(number).padStart(6, "0")} expected ${expected}, got ${actual}`
      );
    }
  }
  const entries = files.map((filename) => {
    const sql = readFileSync(resolve(migrationsDir, filename), "utf8");
    return {
      filename,
      number: migrationNumber(filename),
      sha256: sha256(sql),
      sql
    };
  });
  const migration175 = entries.find((entry) => entry.number === 175);
  if (
    migration175?.filename !==
      "000175_2026_responsibility_user_role_queue.sql" ||
    migration175.sha256 !== REVIEWED_MIGRATION_175_SHA256 ||
    !/\bBEGIN;\s/i.test(migration175.sql) ||
    !/\bCOMMIT;\s*$/i.test(migration175.sql) ||
    !migration175.sql.includes("Missing responsibility role codes") ||
    /^\s*(CREATE|ALTER|DROP|TRUNCATE)\b/im.test(migration175.sql)
  ) {
    throw new Error("migration 000175 no longer matches the reviewed rollback contract");
  }
  const canonical = {
    contract_version: REVIEWED_BOOTSTRAP_CONTRACT_VERSION,
    image: OFFICIAL_POSTGRES_IMAGE,
    migration_numbering: {
      first: 1,
      baseline_last: 174,
      allowed_duplicate: 136,
      skipped: 175,
      final_first: 176,
      final_last: 183
    },
    applied: entries
      .filter((entry) => entry.number !== 175)
      .map((entry) => ({
        filename: entry.filename,
        sha256: entry.sha256
      })),
    skipped: [
      {
        filename: migration175.filename,
        sha256: migration175.sha256,
        reason_code: "production-data-patch-empty-db-fail-fast"
      }
    ]
  };
  const bootstrapSha256 = sha256(JSON.stringify(canonical));
  if (bootstrapSha256 !== REVIEWED_BOOTSTRAP_SHA256) {
    throw new Error(
      `reviewed bootstrap SHA drift: expected ${REVIEWED_BOOTSTRAP_SHA256}, got ${bootstrapSha256}`
    );
  }
  return { entries, canonical, bootstrapSha256, migration175 };
}

export async function verifyReviewedMigration175Rollback({
  migration,
  psql
}) {
  if (
    migration.sha256 !== REVIEWED_MIGRATION_175_SHA256 ||
    migration.number !== 175
  ) {
    throw new Error("refusing unreviewed migration 000175 rollback probe");
  }
  const result = await psql(migration.sql, { allowFailure: true });
  const diagnostic = `${result.stderr}\n${result.stdout}`;
  if (
    result.status === 0 ||
    !diagnostic.includes("Missing responsibility role codes")
  ) {
    throw new Error(
      "migration 000175 did not produce its reviewed empty-database fail-fast"
    );
  }
  const residual = await psql(
    `
      SELECT
        (SELECT count(*) FROM sys_org
          WHERE remark = '依据《金湖集团部门及人员职责分工（2026）》增量维护')
        || '|' ||
        (SELECT count(*) FROM sys_post
          WHERE remark = '依据《金湖集团部门及人员职责分工（2026）》增量维护')
        || '|' ||
        (SELECT count(*) FROM sys_user
          WHERE remark LIKE '%依据《金湖集团部门及人员职责分工（2026）》增量维护')
        || '|' ||
        (SELECT count(*) FROM rel_user_role
          WHERE remark = '2026 职责分工标准角色队列');
    `,
    { tuplesOnly: true }
  );
  if (residual.stdout.trim() !== "0|0|0|0") {
    throw new Error(
      `migration 000175 rollback residual: ${residual.stdout.trim()}`
    );
  }
  return {
    filename: migration.filename,
    sha256: migration.sha256,
    reason_code: "production-data-patch-empty-db-fail-fast",
    rollback_residual: residual.stdout.trim()
  };
}
