#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  MaterializationKeyContractError,
  readMaterializationKeyFile,
  validateMaterializationKeyBytes,
} from "../hr-cutover/materialization-key-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const verifier = resolve(root, "scripts/hr-cutover/materialization-key-contract.mjs");
const transform = resolve(root, "scripts/transform-yuzhou-t5-legacy-history.mjs");
const sandbox = mkdtempSync(join(tmpdir(), "yuzhou-materialization-key-contract-"));
const keyRoot = join(sandbox, "keys");
mkdirSync(keyRoot, { mode: 0o700 });

const writeKey = (name, value, mode = 0o600) => {
  const path = join(keyRoot, name);
  writeFileSync(path, value, { mode });
  chmodSync(path, mode);
  return path;
};
const validKey = "ab".repeat(32);
const invalid = new Map([
  ["short", `${"ab".repeat(31)}\n`],
  ["long", `${"ab".repeat(48)}\n`],
  ["nonhex", `${"zz".repeat(32)}\n`],
  ["multiline", `${validKey}\n${"cd".repeat(32)}\n`],
  ["leading-blank", `\n${validKey}\n`],
  ["trailing-blank", `${validKey}\n\n`],
  ["crlf", `${validKey}\r\n`],
  ["leading-space", ` ${validKey}`],
  ["trailing-space", `${validKey} `],
]);

try {
  assert.equal(validateMaterializationKeyBytes(validKey), validKey);
  assert.equal(validateMaterializationKeyBytes(`${validKey}\n`), validKey);
  for (const [label, value] of invalid) {
    assert.throws(
      () => validateMaterializationKeyBytes(value),
      error => error instanceof MaterializationKeyContractError && error.kind === "content",
      label,
    );
  }

  const validPath = writeKey("valid.key", `${validKey}\n`);
  assert.equal(readMaterializationKeyFile(validPath), validKey);
  const cliValid = spawnSync(process.execPath, [verifier, "verify", validPath], { encoding: "utf8" });
  assert.equal(cliValid.status, 0, cliValid.stderr);
  assert.equal(cliValid.stdout, "", "successful verification must not output the key");
  assert.equal(cliValid.stderr, "", "successful verification must be silent");

  for (const [label, value] of invalid) {
    const path = writeKey(`${label}.key`, value);
    assert.throws(
      () => readMaterializationKeyFile(path),
      error => error instanceof MaterializationKeyContractError && error.kind === "content",
      label,
    );
    const cli = spawnSync(process.execPath, [verifier, "verify", path], { encoding: "utf8" });
    assert.equal(cli.status, 1, label);
    assert.equal(cli.stdout, "", `${label} verification must not output the key`);
    assert.match(cli.stderr, /^MATERIALIZATION_KEY_CONTRACT_FAILED:/u, label);
    assert.doesNotMatch(cli.stderr, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), `${label} key must not appear in diagnostics`);
  }

  const publicPath = writeKey("public.key", `${validKey}\n`, 0o644);
  assert.throws(() => readMaterializationKeyFile(publicPath), error => error instanceof MaterializationKeyContractError && error.kind === "file");
  const symlinkPath = join(keyRoot, "linked.key");
  symlinkSync(validPath, symlinkPath);
  assert.throws(() => readMaterializationKeyFile(symlinkPath), error => error instanceof MaterializationKeyContractError && error.kind === "file");

  const staging = join(sandbox, "staging-contract-probe");
  mkdirSync(staging, { mode: 0o700 });
  const overlongPath = writeKey("transform-overlong.key", `${"ab".repeat(48)}\n`);
  const transformFailure = spawnSync(process.execPath, [transform, staging], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, YUZHOU_PARTY_DATA_KEY_FILE: overlongPath },
  });
  assert.equal(transformFailure.status, 1);
  assert.match(transformFailure.stderr, /materialization key must contain exactly 64 hexadecimal characters/u);
  assert.doesNotMatch(transformFailure.stderr, /catalog\.raw\.json|ENOENT/u, "transform must reject the key before staging/source reads");

  const sourceFiles = [
    "scripts/hr-cutover/prepare-full-domain-rehearsal.mjs",
    "scripts/hr-cutover/full-domain-lifecycle.mjs",
    "scripts/hr-cutover/domain-adapter.mjs",
    "scripts/hr-cutover/run-full-domain-technical-uat.mjs",
    "scripts/transform-yuzhou-t5-legacy-history.mjs",
  ];
  for (const relativePath of sourceFiles) {
    const source = readFileSync(resolve(root, relativePath), "utf8");
    assert.match(source, /materialization-key-contract\.mjs/u, `${relativePath} must use the shared contract`);
    assert.doesNotMatch(source, /materialization key must contain at least 32 bytes|Buffer\.byteLength\([^)]*materialization/u, `${relativePath} must not retain the legacy minimum-length rule`);
  }
  const prepare = readFileSync(resolve(root, sourceFiles[0]), "utf8");
  assert(prepare.indexOf("readMaterializationKeyFile(materializationKeySource)") < prepare.indexOf("mkdirSync(credentialRoot"), "prepare must reject before runtime/source materialization");
  const lifecycle = readFileSync(resolve(root, sourceFiles[1]), "utf8");
  assert(lifecycle.indexOf("readMaterializationKeyFile(config.target.materializationKeyArtifact)") < lifecycle.indexOf("mkdirSync(config.target.root"), "provision must reject before runtime resource creation");
  const adapter = readFileSync(resolve(root, sourceFiles[2]), "utf8");
  assert(adapter.indexOf("readMaterializationKeyFile(keyPath)") < adapter.indexOf("const env = childEnvironment"), "adapter must reject before child/source execution");
  const technicalUat = readFileSync(resolve(root, sourceFiles[3]), "utf8");
  assert(technicalUat.indexOf("partyDataEncryptionKey=materializationKey") < technicalUat.lastIndexOf("buildWebForTarget(config)"), "technical UAT must reject before builds, Docker or database access");
  const extractor = readFileSync(resolve(root, "scripts/extract-yuzhou-t5-legacy-history.sh"), "utf8");
  assert.match(extractor, /materialization-key-contract\.mjs" verify/u);
  assert(extractor.indexOf("materialization-key-contract.mjs") < extractor.indexOf("docker inspect"), "extractor must verify before Docker/source access");
  const fullDomainContract = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/full-domain-contract-v1.json"), "utf8"));
  assert(fullDomainContract.triple.mappingContractComponents.includes("scripts/hr-cutover/materialization-key-contract.mjs"), "shared key semantics must be pinned by the mapping hash");

  process.stdout.write("Yuzhou materialization key shared contract passed.\n");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
