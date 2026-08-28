#!/usr/bin/env node
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export class MaterializationKeyContractError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "MaterializationKeyContractError";
    this.kind = kind;
  }
}

export function validateMaterializationKeyBytes(bytes) {
  const value = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes);
  const key = value.length === 65 && value.endsWith("\n") ? value.slice(0, -1) : value;
  if ((value.length !== 64 && value.length !== 65) || !/^[0-9a-fA-F]{64}$/u.test(key)) {
    throw new MaterializationKeyContractError(
      "content",
      "materialization key must contain exactly 64 hexadecimal characters and at most one trailing LF",
    );
  }
  return key;
}

export function readMaterializationKeyFile(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
      throw new MaterializationKeyContractError(
        "file",
        "materialization key must be a non-symlink 0600 regular file",
      );
    }
    return validateMaterializationKeyBytes(readFileSync(descriptor));
  } catch (error) {
    if (error instanceof MaterializationKeyContractError) throw error;
    throw new MaterializationKeyContractError(
      "file",
      "materialization key must be a non-symlink 0600 regular file",
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function main(argv) {
  if (argv.length !== 2 || argv[0] !== "verify" || !argv[1]) {
    throw new MaterializationKeyContractError("cli", "usage: materialization-key-contract.mjs verify <file>");
  }
  readMaterializationKeyFile(argv[1]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof MaterializationKeyContractError
      ? error.message
      : "materialization key verification failed";
    process.stderr.write(`MATERIALIZATION_KEY_CONTRACT_FAILED: ${message}\n`);
    process.exitCode = 1;
  }
}
