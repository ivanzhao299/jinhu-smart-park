import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

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
