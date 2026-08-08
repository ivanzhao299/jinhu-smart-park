import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { CanonicalDetailShellProps } from "./CanonicalDetailShell";

const source = readFileSync(
  resolve(process.cwd(), "apps/web/features/property-shared/detail/CanonicalDetailShell.tsx"),
  "utf8"
);
const css = readFileSync(
  resolve(process.cwd(), "apps/web/features/property-shared/detail/CanonicalDetailShell.module.css"),
  "utf8"
);

const validDrawerProps: CanonicalDetailShellProps = {
  presentation: "drawer",
  entityKey: "booking-1",
  title: "预订详情",
  state: { kind: "loading" },
  onRequestClose: () => undefined
};
const validFullProps: CanonicalDetailShellProps = {
  presentation: "full",
  entityKey: "booking-1",
  title: "预订详情",
  state: { kind: "loading" }
};
// @ts-expect-error A native modal drawer must always expose a close request.
const invalidDrawerProps: CanonicalDetailShellProps = {
  presentation: "drawer",
  entityKey: "booking-1",
  title: "预订详情",
  state: { kind: "loading" }
};
void [validDrawerProps, validFullProps, invalidDrawerProps];

test("detail shell has full and drawer presentations with required states", () => {
  assert.match(source, /presentation: "drawer"; onRequestClose: \(\) => void/);
  assert.match(source, /presentation: "full"; onRequestClose\?: never/);
  for (const state of ["loading", "ready", "forbidden", "not-found", "failure", "conflict"]) {
    assert.match(source, new RegExp(`"${state}"`));
  }
  assert.match(source, /state\.stale/);
});

test("detail shell uses existing surfaces and native modal drawer semantics", () => {
  assert.match(source, /"ds-panel"/);
  assert.match(source, /"ds-page"/);
  assert.match(source, /<dialog/);
  assert.match(source, /\.showModal\(\)/);
  assert.match(source, /onCancel=/);
  assert.match(source, /restoreDrawerTriggerFocus/);
  assert.doesNotMatch(source, /aria-modal="true"/);
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}/);
  assert.doesNotMatch(source, /boxShadow|backgroundColor|borderColor/);
  assert.match(css, /min-block-size: 44px/);
  assert.match(css, /min-inline-size: 44px/);
  assert.doesNotMatch(css, /color:|background:|box-shadow:|border:/);
});
