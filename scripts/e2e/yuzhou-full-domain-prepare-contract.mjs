import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configFor, assertRegularFile, deterministicUuid, parseArgs, t5BusinessHashFor } from "../hr-cutover/prepare-full-domain-rehearsal.mjs";
import { readMaterializationKeyFile } from "../hr-cutover/materialization-key-contract.mjs";

test("rehearsal preparation accepts only private non-symlink source inputs", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-yuzhou-prepare-"));
  try {
    const privateFile = join(root, "private.dbk");
    const publicFile = join(root, "public.dbk");
    const symlink = join(root, "linked.dbk");
    writeFileSync(privateFile, "fixed-source", { mode: 0o600 });
    writeFileSync(publicFile, "fixed-source", { mode: 0o644 });
    chmodSync(privateFile, 0o600);
    chmodSync(publicFile, 0o644);
    symlinkSync(privateFile, symlink);

    assert.equal(assertRegularFile(privateFile, "source backup", { privateFile: true }), realpathSync(privateFile));
    assert.throws(
      () => assertRegularFile(publicFile, "source backup", { privateFile: true }),
      /source backup must be mode 0600/,
    );
    assert.throws(
      () => assertRegularFile(symlink, "source backup", { privateFile: true }),
      /source backup must be a non-symlink regular file/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rehearsal preparation requires the exact T5 32-byte hexadecimal key contract", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-yuzhou-prepare-key-"));
  try {
    const valid = join(root, "valid.key");
    const short = join(root, "short.key");
    const long = join(root, "long.key");
    const nonHex = join(root, "nonhex.key");
    const multiline = join(root, "multiline.key");
    const blankLines = join(root, "blank-lines.key");
    const crlf = join(root, "crlf.key");
    const spaces = join(root, "spaces.key");
    writeFileSync(valid, `${"ab".repeat(32)}\n`, { mode: 0o600 });
    writeFileSync(short, `${"ab".repeat(31)}\n`, { mode: 0o600 });
    writeFileSync(long, `${"ab".repeat(48)}\n`, { mode: 0o600 });
    writeFileSync(nonHex, `${"zz".repeat(32)}\n`, { mode: 0o600 });
    writeFileSync(multiline, `${"ab".repeat(32)}\n${"cd".repeat(32)}\n`, { mode: 0o600 });
    writeFileSync(blankLines, `\n${"ab".repeat(32)}\n\n`, { mode: 0o600 });
    writeFileSync(crlf, `${"ab".repeat(32)}\r\n`, { mode: 0o600 });
    writeFileSync(spaces, ` ${"ab".repeat(32)} `, { mode: 0o600 });

    assert.equal(readMaterializationKeyFile(valid), "ab".repeat(32));
    for (const candidate of [short, long, nonHex, multiline, blankLines, crlf, spaces]) {
      assert.throws(
        () => readMaterializationKeyFile(candidate),
        /materialization key must contain exactly 64 hexadecimal characters and at most one trailing LF/,
      );
    }

    const suffix = "invalid_key_preflight";
    assert.throws(() => configFor({
      suffix,
      materializationKey: long,
      controlRoot: root,
    }, "a".repeat(40), "b".repeat(64)), /materialization key must contain exactly 64 hexadecimal characters/);
    assert.equal(existsSync(join(root, `jinhu_hr_migration_lab_full_${suffix}`)), false, "invalid key must fail before rehearsal filesystem creation or source access");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rehearsal preparation requires an externally fixed machine-attestation root", () => {
  const base = [
    "--rehearsal", "A",
    "--suffix", "machine_gate",
    "--postgres-port", "15432",
    "--api-port", "18080",
    "--web-port", "13000",
    "--control-root", "/tmp/control",
    "--etl-env", "/tmp/etl.env",
    "--t4-evidence", "/tmp/t4.json",
    "--source-container", "yuzhou-source",
    "--source-backup", "/tmp/source.bak",
    "--source-restore-receipt", "/tmp/source-receipt.json",
    "--materialization-key", "/tmp/materialization.key",
  ];
  assert.throws(() => parseArgs(base), /missing --machine-attestation-root/);
  assert.throws(
    () => parseArgs([...base, "--machine-attestation-root", "A".repeat(64)]),
    /lowercase SHA-256 trusted root/,
  );
  assert.equal(
    parseArgs([...base, "--machine-attestation-root", "a".repeat(64)]).machineAttestationRoot,
    "a".repeat(64),
  );
  assert.throws(() => parseArgs(base.filter((value) => value !== "--source-restore-receipt" && value !== "/tmp/source-receipt.json")), /missing --source-restore-receipt/);
});

test("full-domain rehearsal gives T5 a deterministic isolated non-login actor identity", () => {
  const first = deterministicUuid("jinhu_hr_migration_lab_full_actor_test:yzfull-20260831T000000Z-aaaaaaaa-rA");
  const second = deterministicUuid("jinhu_hr_migration_lab_full_actor_test:yzfull-20260831T000000Z-aaaaaaaa-rA");
  const other = deterministicUuid("jinhu_hr_migration_lab_full_actor_test:yzfull-20260831T000001Z-aaaaaaaa-rB");
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, second);
  assert.notEqual(first, other);
});

test("full-domain preparation pins T5 to the canonical A/B baseline and source restore receipt", () => {
  const sourceSnapshotHash = "3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e";
  const sourceRestoreReceiptSha256 = "941261f619f84a02f668bf1d4465a0a3b501817ce73756738a2f760f6ec96867";
  assert.equal(t5BusinessHashFor({ sourceSnapshotHash, sourceRestoreReceiptSha256 }), "8856da58163b4412a12c9cf70a8a4008b356c3493ab224ed900e9dda329e608c");
  assert.throws(() => t5BusinessHashFor({ sourceSnapshotHash, sourceRestoreReceiptSha256: "0".repeat(64) }), /does not bind the current source restore receipt/);
});
