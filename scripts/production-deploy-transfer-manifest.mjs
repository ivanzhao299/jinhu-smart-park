#!/usr/bin/env node

const manifests = {
  "fast-css": [
    "file:.release.json",
    "file:apps/web/public/runtime-design-system.css",
  ],
  web: [
    "file:.release.json",
    "dir:apps/web",
    "dir:packages/config",
    "dir:packages/shared",
    "dir:packages/ui",
  ],
  api: [
    "file:.release.json",
    "dir:apps/api",
    "dir:packages/config",
    "dir:packages/shared",
  ],
  database: [
    "file:.release.json",
    "dir:database",
    "file:scripts/bootstrap-admin.sh",
    "file:scripts/check-init-baseline.sh",
    "file:scripts/db-migrate.sh",
    "file:scripts/db-seed-prod.sh",
    "file:scripts/diagnose-000189-asset-scope.sh",
    "file:scripts/diagnose-000194-runtime-control.sh",
    "file:scripts/prod-deploy.sh",
    "file:scripts/repair-000194-retired-runtime-owner.sh",
  ],
};

const mode = process.argv[2];
if (mode === "full") process.exit(0);
if (!Object.hasOwn(manifests, mode)) {
  throw new Error(`Unsupported narrow transfer mode: ${mode || "(empty)"}`);
}

for (const entry of manifests[mode]) process.stdout.write(`${entry}\n`);
