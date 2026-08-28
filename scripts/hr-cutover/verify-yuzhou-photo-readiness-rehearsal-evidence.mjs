#!/usr/bin/env node
import { resolve } from "node:path";
import { verifyYuzhouPhotoRehearsalEvidenceFromPath } from "./yuzhou-photo-readiness-rehearsal-evidence-lib.mjs";

const index = process.argv.indexOf("--evidence"), path = index >= 0 ? process.argv[index + 1] : null;
if (!path) throw new Error("--evidence requires a controlled external index path");
process.stdout.write(`${JSON.stringify(verifyYuzhouPhotoRehearsalEvidenceFromPath(resolve(path)))}\n`);
