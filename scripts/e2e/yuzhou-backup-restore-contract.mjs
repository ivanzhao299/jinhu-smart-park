#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const script = readFileSync(resolve(root, "scripts/restore-yuzhou-sqlserver-backup.sh"), "utf8");

assert.match(script, /ALLOW_YUZHOU_MIGRATION/);
assert.match(script, /YUZHOU_MIGRATION_RUN_ID is required/);
assert.match(script, /YuzhouHR_Lab_/);
assert.match(script, /backup SHA-256 mismatch/);
assert.match(script, /database\/backups\/yuzhou-hr/);
assert.match(script, /EXPLICIT_BACKUP_FILE/);
assert.match(script, /backup file must be private mode 0600/);
assert.match(script, /ETL credential must bind the target isolated database before restore/);
assert.match(script, /com\.docker\.compose\.project/);
assert.match(script, /jinhu_yuzhou_migration_lab/);
assert.match(script, /RESTORE VERIFYONLY/);
assert.match(script, /RESTORE HEADERONLY/);
assert.match(script, /RESTORE FILELISTONLY/);
assert.match(script, /YUZHOU_BACKUP_SET/);
assert.match(script, /Target migration database already exists/);
assert.match(script, /SET READ_ONLY WITH ROLLBACK IMMEDIATE/);
assert.doesNotMatch(script, /WITH\s+REPLACE/i);
assert.doesNotMatch(script, /MSSQL_SA_PASSWORD:\s*[^$]/);
assert.doesNotMatch(script, /sqlcmd[^\n]*\|\s*tee/);
assert.match(script, /docker exec -u 0 "\$CONTAINER_NAME" rm -f "\$CONTAINER_SQL" "\$CONTAINER_BACKUP"/);

console.log("Yuzhou backup restore contract passed.");
