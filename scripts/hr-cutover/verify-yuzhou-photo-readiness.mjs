#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyYuzhouPhotoReadiness } from "./yuzhou-photo-readiness-lib.mjs";

const argument = process.argv.indexOf("--contract");
const contractPath = argument >= 0 ? process.argv[argument + 1] : resolve(import.meta.dirname, "contracts/yuzhou-photo-readiness-v1.json");
if (!contractPath) throw new Error("--contract requires a path");
const result = verifyYuzhouPhotoReadiness(JSON.parse(readFileSync(resolve(contractPath), "utf8")));
process.stdout.write(`${JSON.stringify(result)}\n`);
