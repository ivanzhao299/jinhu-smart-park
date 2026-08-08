import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { projectPropertyRecord, type PropertyFieldDescriptor } from "./property-records";

interface ExampleRow {
  id: string;
  code: string;
  status: string;
}

const fields: readonly PropertyFieldDescriptor<ExampleRow>[] = [
  { key: "code", label: "编号", render: (item) => item.code },
  { key: "status", label: "状态", render: (item) => item.status }
];

test("one field descriptor projection feeds desktop and mobile records", () => {
  const projected = projectPropertyRecord(
    { id: "row-1", code: "A-001", status: "待处理" },
    fields
  );

  assert.deepEqual(projected, [
    { key: "code", label: "编号", value: "A-001" },
    { key: "status", label: "状态", value: "待处理" }
  ]);
});

test("property surfaces reuse shared DS and keep domain/API imports out", () => {
  const source = readFileSync(resolve(__dirname, "PropertyPageSurfaces.tsx"), "utf8");
  const css = readFileSync(resolve(__dirname, "PropertyPageSurfaces.module.css"), "utf8");

  assert.match(source, /from "@jinhu\/ui"/);
  assert.match(source, /styles\.accessibilitySurface/);
  assert.match(source, /styles\.responsiveRecords/);
  assert.match(source, /propertyAccessibleControlClassName/);
  assert.match(source, /className="ds-mobile-record-list"/);
  assert.match(source, /<DataTable aria-label=/);
  assert.equal(source.match(/projectPropertyRecord\(item, fields\)/g)?.length, 2);
  assert.match(css, /display: inline-flex/);
  assert.match(css, /min-block-size: 44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition-duration: 0\.01ms !important/);
  assert.match(css, /transform: none !important/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /border-color: CanvasText/);
  assert.match(css, /border-color: ButtonText/);
  assert.match(css, /outline: 2px solid Highlight/);
  assert.match(css, /background-image: none/);
  assert.match(css, /box-shadow: none/);
  assert.doesNotMatch(source, /apiRequest|fetch\(|PermissionGuard/);
  assert.doesNotMatch(source, /homestay|housing|identity|approval/i);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}|linear-gradient|radial-gradient/i);
});
