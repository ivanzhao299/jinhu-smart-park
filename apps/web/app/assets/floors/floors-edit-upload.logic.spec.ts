import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("editing a floor keeps an existing plan without requiring a replacement file", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const uploader = readFileSync(
    resolve(__dirname, "../../../components/files/FileUploader.tsx"),
    "utf8"
  );

  assert.match(page, /\{editingFloor \? \(/);
  assert.match(page, /<AttachmentList bizType="floorplan" bizId=\{editingFloor\.id\}/);
  assert.match(page, /mutationPermission=\{SYSTEM_PERMISSIONS\.FLOOR_UPLOAD_LAYOUT\}/);
  assert.match(uploader, /<input[^>]*type="file"/);
  assert.doesNotMatch(uploader, /<input[^>]*required[^>]*type="file"/);
  assert.doesNotMatch(uploader, /<input[^>]*type="file"[^>]*required/);
});
