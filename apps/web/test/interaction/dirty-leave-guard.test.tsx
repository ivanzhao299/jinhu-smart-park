import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useDirtyLeaveGuard } from "@/features/property-shared/navigation/useDirtyLeaveGuard";
import { describe, expect, it, vi } from "vitest";

function Guard({ busy, dirty = true, message = "存在未保存内容" }: { busy?: boolean; dirty?: boolean; message?: string }) {
  const { confirmLeave } = useDirtyLeaveGuard({ busy, dirty, message });
  return <>
    <a href="/next">离开页面</a>
    <button type="button" onClick={() => confirmLeave()}>局部检查</button>
  </>;
}

describe("useDirtyLeaveGuard mounted lifecycle", () => {
  it("blocks beforeunload and link navigation when the user rejects", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Guard />);

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(beforeUnload)).toBe(false);
    expect(beforeUnload.defaultPrevented).toBe(true);

    const link = screen.getByRole("link", { name: "离开页面" });
    const click = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    expect(link.dispatchEvent(click)).toBe(false);
    expect(click.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledWith("存在未保存内容");
    await user.click(screen.getByRole("button", { name: "局部检查" }));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("keeps global protection until the final mounted guard unmounts", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const first = render(<Guard message="第一份草稿" />);
    const second = render(<Guard message="第二份草稿" />);
    first.unmount();

    const activeLink = second.getByRole("link", { name: "离开页面" });
    const guardedClick = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    expect(activeLink.dispatchEvent(guardedClick)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);

    second.unmount();
    const detachedLink = document.createElement("a");
    detachedLink.href = "#after-cleanup";
    document.body.append(detachedLink);
    const cleanClick = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    expect(detachedLink.dispatchEvent(cleanClick)).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    detachedLink.remove();
  });

  it("does not guard a clean form", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Guard dirty={false} />);
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(beforeUnload)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "局部检查" }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("guards a busy form even before it becomes dirty", () => {
    render(<Guard busy dirty={false} />);
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(beforeUnload)).toBe(false);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });
});
