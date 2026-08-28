import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertMaterializationKey, assertRegularFile } from "../hr-cutover/prepare-full-domain-rehearsal.mjs";

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
    writeFileSync(valid, `${"ab".repeat(32)}\n`, { mode: 0o600 });
    writeFileSync(short, `${"ab".repeat(31)}\n`, { mode: 0o600 });
    writeFileSync(long, `${"ab".repeat(48)}\n`, { mode: 0o600 });
    writeFileSync(nonHex, `${"zz".repeat(32)}\n`, { mode: 0o600 });
    writeFileSync(multiline, `${"ab".repeat(32)}\n${"cd".repeat(32)}\n`, { mode: 0o600 });

    assert.equal(assertMaterializationKey(valid), "ab".repeat(32));
    for (const candidate of [short, long, nonHex, multiline]) {
      assert.throws(
        () => assertMaterializationKey(candidate),
        /materialization key must contain exactly one 32-byte hexadecimal key/,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
