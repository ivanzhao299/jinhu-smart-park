#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

const sourceDir = resolve(process.argv[2] ?? "/Users/mac/Downloads/玉舟人力资源管理系统分析产出");
const outputFile = process.argv[3] ? resolve(process.argv[3]) : null;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await listFiles(path)));
    if (entry.isFile()) paths.push(path);
  }
  return paths;
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function classify(path) {
  const name = basename(path).toLowerCase();
  const normalizedPath = path.replaceAll("\\", "/").toLowerCase();
  if (name === ".ds_store") return "metadata";
  if (name.endsWith(".7z")) return "archive";
  if (name.includes("schema_tables")) return "schema";
  if (name.includes("table_columns")) return "column-catalog";
  if (name.includes("数据字典") || name.includes("字典表")) return "data-dictionary";
  if (name.includes("帮助")) return "help";
  if (normalizedPath.includes("/触发器源码/") || name.includes("trigger")) return "trigger-source";
  if (name.includes("function")) return "function-source";
  if (normalizedPath.includes("/存储过程源码/") || name.endsWith(".sql")) return "sql-source";
  if (name.endsWith(".md")) return "report";
  return "other";
}

function isText(path) {
  const extension = extname(path).toLowerCase();
  return basename(path) !== ".DS_Store" && extension !== ".7z";
}

const files = await listFiles(sourceDir);
const entries = [];
for (const path of files) {
  const info = await stat(path);
  const text = isText(path) ? await readFile(path, "utf8") : null;
  entries.push({
    path: relative(sourceDir, path),
    kind: classify(path),
    bytes: info.size,
    sha256: await sha256(path),
    text:
      text === null
        ? null
        : { encoding: "utf-8", lines: text.length === 0 ? 0 : (text.match(/\n/g) ?? []).length + 1 },
  });
}

const countsByKind = Object.fromEntries(
  [...new Set(entries.map((entry) => entry.kind))]
    .sort()
    .map((kind) => [kind, entries.filter((entry) => entry.kind === kind).length]),
);
const duplicateGroups = Object.values(
  entries.reduce((groups, entry) => {
    (groups[entry.sha256] ??= []).push(entry.path);
    return groups;
  }, {}),
).filter((group) => group.length > 1);

const manifest = {
  formatVersion: 1,
  sourceSystem: "Yuzhou Group V10",
  generatedAt: new Date().toISOString(),
  sourceRootLabel: basename(sourceDir),
  summary: {
    files: entries.length,
    textFiles: entries.filter((entry) => entry.text !== null).length,
    textLines: entries.reduce((sum, entry) => sum + (entry.text?.lines ?? 0), 0),
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    countsByKind,
    duplicateGroups,
  },
  files: entries,
};

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (outputFile) await writeFile(outputFile, serialized, "utf8");
else process.stdout.write(serialized);
