import { constants, openSync, closeSync, fstatSync, lstatSync, readSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import { isAbsolute, join, resolve } from "node:path";
import { YUZHOU_T0_EXTRACT_LAYOUT as LAYOUT } from "./yuzhou-t0-extract-layout.mjs";
import { readProductionImportPrivateBytes, parseProductionImportPrivateJson } from "./materialize-production-import-frozen-decisions.mjs";

const HASH = /^[a-f0-9]{64}$/u, MAX = 384 * 1024 * 1024;
const fail = () => { throw new Error("RETAINED_T0_FILES_INVALID"); };
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join() === [...keys].sort().join();
const same = (a, b) => ["dev", "ino", "size", "mtimeMs", "ctimeMs", "mode", "uid", "nlink"].every(k => a[k] === b[k]);

// Digest-only streaming also accepts empty source tables. No row parsing, row
// copying, log payload, or returned private path; source files never opened writable.
function digest(path, budget) {
  let fd; const buffer = Buffer.alloc(65536);
  try {
    if (realpathSync(path) !== path) fail();
    const before = lstatSync(path);
    if (!before.isFile() || before.uid !== process.getuid() || (before.mode & 0o7777) !== 0o600 || before.nlink !== 1 ||
        !Number.isSafeInteger(before.size) || before.size < 0 || before.size > budget.remaining) fail();
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!same(before, fstatSync(fd))) fail();
    const hash = createHash("sha256"); let bytes = 0;
    while (bytes < before.size) { const n = readSync(fd, buffer, 0, Math.min(buffer.length, before.size - bytes), null); if (!n) fail(); hash.update(buffer.subarray(0, n)); bytes += n; }
    if (readSync(fd, buffer, 0, 1, null) !== 0 || !same(before, fstatSync(fd)) || realpathSync(path) !== path || !same(before, lstatSync(path))) fail();
    budget.remaining -= bytes;
    return { sha256: hash.digest("hex"), bytes, stat: before };
  } finally { buffer.fill(0); if (fd !== undefined) closeSync(fd); }
}

/** Content evidence only: a pinned extract manifest is NOT source/runtime
 * attestation. Lifecycle source binding must be independently verified next. */
export function verifyYuzhouRetainedT0Files(input) {
  try {
    if (!exact(input, ["directory", "manifestSha256"]) || !HASH.test(input.manifestSha256 ?? "") ||
        typeof input.directory !== "string" || !isAbsolute(input.directory) || resolve(input.directory) !== input.directory || realpathSync(input.directory) !== input.directory) fail();
    const root = lstatSync(input.directory);
    if (!root.isDirectory() || root.uid !== process.getuid() || (root.mode & 0o7777) !== 0o700) fail();
    const parts = [], path = join(input.directory, "manifest.json");
    let manifest, measured;
    try {
      measured = readProductionImportPrivateBytes(path, 65536, { bytes: 0, maximum: 65536 }, b => parts.push(Buffer.from(b)));
      const bytes = Buffer.concat(parts); try { manifest = parseProductionImportPrivateJson(bytes); } finally { bytes.fill(0); }
    } finally { parts.forEach(b => b.fill(0)); }
    if (measured.sha256 !== input.manifestSha256 || !exact(manifest, ["formatVersion", "generatedAt", "domains"]) || manifest.formatVersion !== 1 ||
        typeof manifest.generatedAt !== "string" || !Number.isFinite(Date.parse(manifest.generatedAt)) || !exact(manifest.domains, Object.keys(LAYOUT))) fail();
    const files = [], pins = [], budget = { remaining: MAX };
    for (const [domain, layout] of Object.entries(LAYOUT)) {
      const row = manifest.domains[domain];
      if (!exact(row, ["rows", "file", "fileSha256"]) || !Number.isSafeInteger(row.rows) || row.rows < 0 || row.file !== layout.file || !HASH.test(row.fileSha256 ?? "")) fail();
      const file = join(input.directory, layout.file), observed = digest(file, budget);
      if (observed.sha256 !== row.fileSha256) fail();
      pins.push({ file, stat: observed.stat });
      files.push({ domain, sha256: observed.sha256, bytes: observed.bytes, declaredRows: row.rows });
    }
    if (realpathSync(input.directory) !== input.directory || !same(root, lstatSync(input.directory)) ||
        !same(measured.stat, lstatSync(path)) || pins.some(p => realpathSync(p.file) !== p.file || !same(p.stat, lstatSync(p.file)))) fail();
    return { status: "RETAINED_T0_CONTENT_VERIFIED", manifestSha256: measured.sha256, files,
      sourceBindingVerified: false, rowCountsVerified: false, lifecycleReady: false, databaseWrites: 0, productionImport: "HOLD" };
  } catch { fail(); }
}
