import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configFor, assertRegularFile } from "../hr-cutover/prepare-full-domain-rehearsal.mjs";
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
