#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const globalsPath = resolve(root, "apps/web/app/globals.css");
const terminalPath = resolve(root, "apps/web/app/mobile-terminal.css");
const globals = readFileSync(globalsPath, "utf8");
const terminal = readFileSync(terminalPath, "utf8");
const globalLines = globals.split(/\r?\n/).length;
const failures = [];

if (globalLines > 9700) failures.push(`globals.css exceeds 9700 lines: ${globalLines}`);
for (const legacyMarker of [
  "Final mobile operations theme override",
  "Terminal header hardening",
  "Canonical mobile terminal shell override"
]) {
  if (globals.includes(legacyMarker)) failures.push(`legacy terminal override remains in globals.css: ${legacyMarker}`);
}
if (!terminal.includes(".mobile-terminal-header")) failures.push("mobile-terminal.css is missing the dedicated terminal header");
if (!terminal.includes("env(safe-area-inset-top)")) failures.push("mobile-terminal.css is missing safe-area support");

const report = {
  status: failures.length === 0 ? "PASS" : "FAIL",
  globals_lines: globalLines,
  terminal_lines: terminal.split(/\r?\n/).length,
  failures
};
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
