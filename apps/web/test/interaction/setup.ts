import "@testing-library/jest-dom/vitest";
import { cleanup,configure } from "@testing-library/react";
import { afterEach } from "vitest";

// CI shares workers across a large interaction suite. Keep local feedback at the
// library default while allowing bounded multi-page/debounced assertions to settle.
if (process.env.CI === "true") configure({ asyncUtilTimeout: 5000 });

const dialogPrototype = HTMLDialogElement.prototype;

if (!dialogPrototype.showModal) {
  dialogPrototype.showModal = function showModal() {
    this.open = true;
  };
}
if (!dialogPrototype.close) {
  dialogPrototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

Object.defineProperty(HTMLElement.prototype, "getClientRects", {
  configurable: true,
  value() {
    return [{ width: 1, height: 1 }] as unknown as DOMRectList;
  }
});

afterEach(() => cleanup());
