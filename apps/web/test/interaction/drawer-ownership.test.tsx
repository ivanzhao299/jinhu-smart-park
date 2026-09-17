import { fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "@jinhu/ui";

describe("Drawer Escape ownership", () => {
  it("closes only the top owner, keeps ordering across callback changes, and releases on unmount", () => {
    const parent = vi.fn();
    const child = vi.fn();
    const nextParent = vi.fn();
    const view = render(<StrictMode><Drawer onClose={parent} /><Drawer onClose={child} /></StrictMode>);
    view.rerender(<StrictMode><Drawer onClose={nextParent} /><Drawer onClose={child} /></StrictMode>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(child).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
    expect(nextParent).not.toHaveBeenCalled();
    view.rerender(<StrictMode><Drawer onClose={nextParent} /></StrictMode>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(nextParent).toHaveBeenCalledTimes(1);
    view.unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(nextParent).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("a non-dismissible top owner never falls through (callback=%s)", (callback) => {
    const parent = vi.fn();
    const child = vi.fn();
    render(<><Drawer onClose={parent} /><Drawer onClose={callback ? child : undefined} closeOnEscape={false} /></>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(parent).not.toHaveBeenCalled();
    expect(child).not.toHaveBeenCalled();
  });

  it("handles nested initial mounts in StrictMode and respects defaultPrevented", () => {
    const parent = vi.fn();
    const child = vi.fn();
    render(<StrictMode><Drawer onClose={parent}><Drawer onClose={child} /></Drawer></StrictMode>);
    const prevented = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    prevented.preventDefault();
    fireEvent(document, prevented);
    expect(child).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(child).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });
});
