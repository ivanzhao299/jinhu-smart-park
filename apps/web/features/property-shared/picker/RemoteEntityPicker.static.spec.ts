import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const componentPath = resolve(
  process.cwd(),
  "apps/web/features/property-shared/picker/RemoteEntityPicker.tsx"
);
const componentSource = readFileSync(componentPath, "utf8");
const viewSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/features/property-shared/picker/RemoteEntityPickerView.tsx"
  ),
  "utf8"
);
const controllerSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/features/property-shared/picker/picker-controller.ts"
  ),
  "utf8"
);
const coordinatorSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/features/property-shared/picker/picker-load-coordinator.ts"
  ),
  "utf8"
);
const cssSource = readFileSync(
  resolve(
    process.cwd(),
    "apps/web/features/property-shared/picker/RemoteEntityPicker.module.css"
  ),
  "utf8"
);
const implementationSource = [
  componentSource,
  viewSource,
  controllerSource,
  coordinatorSource
].join("\n");

test("picker declares the static ARIA combobox and listbox contract", () => {
  for (const fragment of [
    'role="combobox"',
    'aria-autocomplete="list"',
    "aria-expanded={state.open}",
    "aria-controls={controller.listboxId}",
    "aria-activedescendant=",
    'role="listbox"',
    'role="option"',
    "aria-selected={selected}",
    "aria-disabled={Boolean(option.disabledReason)}",
    'role={state.status === "failure" ? "alert" : "status"}',
    "aria-live="
  ]) {
    assert.match(implementationSource, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("picker statically wires keyboard, debounce, cancellation and injected loader only", () => {
  for (const fragment of [
    "ArrowDown:",
    "ArrowUp:",
    'event.key === "Enter"',
    'event.key === "Escape"',
    "new AbortController()",
    "controller.abort()",
    "REMOTE_PICKER_DEBOUNCE_MS",
    "loadOptions({"
  ]) {
    assert.equal(implementationSource.includes(fragment), true, `missing ${fragment}`);
  }
  assert.equal(implementationSource.includes("apiRequest"), false);
  assert.equal(implementationSource.includes("fetch("), false);
  assert.match(
    controllerSource,
    /if \(change\.clearSelection\) props\.onChange\(null\)/
  );
});

test("pagination stays outside listbox and controls use approved touch-safe surfaces", () => {
  const resultsSection = viewSource.slice(
    viewSource.indexOf("function PickerResults"),
    viewSource.indexOf("function PickerStatus")
  );
  const rootViewSection = viewSource.slice(
    viewSource.indexOf("export function RemoteEntityPickerView")
  );
  assert.equal(resultsSection.includes("<PickerPagination"), false);
  assert.match(rootViewSection, /<PickerResults[\s\S]*<PickerPagination/);
  assert.doesNotMatch(viewSource, /className="(?:btn secondary|form-group|form-hint)"/);
  assert.doesNotMatch(viewSource, /style=\{\{/);
  assert.match(viewSource, /<Button[\s\S]*size="lg"/);
  assert.match(cssSource, /\.input[\s\S]*min-height: 44px/);
  assert.match(cssSource, /\.option[\s\S]*min-height: 44px/);
  assert.match(cssSource, /\.clearButton[\s\S]*min-width: 44px/);
});

test("access and picker files stay behind the shared-root and domain import boundary", () => {
  const files = [
    "apps/web/features/property-shared/access/capability-adapter.ts",
    "apps/web/features/property-shared/picker/RemoteEntityPicker.tsx",
    "apps/web/features/property-shared/picker/RemoteEntityPickerView.tsx",
    "apps/web/features/property-shared/picker/picker-controller.ts",
    "apps/web/features/property-shared/picker/picker-load-coordinator.ts",
    "apps/web/features/property-shared/picker/picker-state.ts",
    "apps/web/features/property-shared/picker/types.ts"
  ];
  for (const file of files) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /@jinhu\/shared\//);
    assert.doesNotMatch(source, /features\/(?:homestay|housing)/);
    assert.doesNotMatch(source, /app\/(?:homestay|housing)/);
    assert.doesNotMatch(source, /\b(?:identity|approval|maker-checker)\b/i);
  }
});
