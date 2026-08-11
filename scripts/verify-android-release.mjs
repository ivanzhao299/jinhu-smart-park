#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.resolve(root, process.argv[2] ?? "apps/web/public/downloads/android/latest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const requiredStrings = ["versionName", "fileName", "downloadUrl", "sha256", "builtAt", "commit", "releaseNotes"];

if (manifest.platform !== "android") throw new Error("latest.json platform must be android");
if (!Number.isInteger(manifest.versionCode) || manifest.versionCode < 1) throw new Error("latest.json versionCode must be a positive integer");
for (const field of requiredStrings) {
  if (typeof manifest[field] !== "string" || manifest[field].trim() === "") throw new Error(`latest.json ${field} must be a non-empty string`);
}
if (path.basename(manifest.fileName) !== manifest.fileName || !manifest.fileName.endsWith(".apk")) throw new Error("latest.json fileName must be an APK basename");
if (manifest.downloadUrl !== `/downloads/android/${manifest.fileName}`) throw new Error("latest.json downloadUrl does not match fileName");
if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error("latest.json sha256 must contain 64 hexadecimal characters");

const apkPath = path.resolve(path.dirname(manifestPath), manifest.fileName);
const apk = readFileSync(apkPath);
const actualHash = createHash("sha256").update(apk).digest("hex");
const actualSize = statSync(apkPath).size;
if (actualHash !== manifest.sha256) throw new Error(`APK SHA-256 mismatch: expected ${manifest.sha256}, got ${actualHash}`);
if (actualSize !== manifest.sizeBytes) throw new Error(`APK size mismatch: expected ${manifest.sizeBytes}, got ${actualSize}`);
const latestApkPath = path.resolve(path.dirname(manifestPath), "smart-park-latest.apk");
const latestHash = createHash("sha256").update(readFileSync(latestApkPath)).digest("hex");
if (latestHash !== actualHash) throw new Error("smart-park-latest.apk does not match the versioned APK");

process.stdout.write(`Android release verified: v${manifest.versionName} (${actualSize} bytes, ${actualHash})\n`);
