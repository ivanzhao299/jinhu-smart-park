import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useRef, useState } from "react";
import { useOwnedScrollLock } from "@/features/property-shared/dialog/useOwnedScrollLock";
import { describe, expect, it, vi } from "vitest";
import { ConsequenceDialog } from "@/features/property-shared/dialog/ConsequenceDialog";
import { HomestayStayActions } from "@/app/homestay/_components/HomestayStayActions";
import type { HomestayBookingDetailResponse } from "@jinhu/shared";
import type { PropertyCapabilityProjection } from "@/features/property-shared";

function DialogHost({ onConfirm, busy = false }: { onConfirm(reason?: string): boolean | Promise<boolean>; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const fallback = useRef<HTMLHeadingElement>(null);
  return <>
    <h1 ref={fallback} tabIndex={-1}>所属标题</h1>
    <button type="button" onClick={() => setOpen(true)}>打开确认</button>
    <ConsequenceDialog
      fallbackFocusRef={fallback}
      actionLabel="确认执行"
      busy={busy}
      consequences={["状态将永久改变"]}
      onConfirm={onConfirm}
      onOpenChange={setOpen}
      open={open}
      reasonPolicy={{ kind: "required", label: "操作原因", minLength: 2, maxLength: 500 }}
      resultingState="已完成"
      target={{ id: "target-1", label: "测试对象" }}
      title="确认高风险操作"
    />
  </>;
}

describe("ConsequenceDialog mounted interactions", () => {
  it("coexists with another opted-in owner in StrictMode and preserves unrelated original styles", () => {
    function OtherOwner() { useOwnedScrollLock(true); return null; }
    const style = document.documentElement.style;
    style.setProperty("overflow", "scroll", "important");
    style.setProperty("scroll-behavior", "smooth");
    const original = style.cssText;
    const other = render(<StrictMode><OtherOwner /></StrictMode>);
    const dialog = render(<DialogHost onConfirm={() => false} />);
    fireEvent.click(dialog.container.querySelector("button")!);
    other.unmount();
    expect(style.overflow).toBe("hidden");
    dialog.unmount();
    expect(style.cssText).toBe(original);
    style.cssText = "";
  });

  it("does not overwrite a later external owner's important overflow lock", () => {
    const view = render(<DialogHost onConfirm={() => false} />);
    fireEvent.click(view.container.querySelector("button")!);
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    view.unmount();
    expect(document.documentElement.style.getPropertyPriority("overflow")).toBe("important");
    document.documentElement.style.removeProperty("overflow");
  });

  it("keeps Tab on the dialog when every control is disabled", async () => {
    const user = userEvent.setup();
    render(<DialogHost onConfirm={() => false} busy />);
    await user.click(screen.getByRole("button", { name: "打开确认" }));
    const dialog = screen.getByRole("dialog");
    for (const shiftKey of [false, true]) {
      expect(fireEvent.keyDown(dialog, { key: "Tab", shiftKey, cancelable: true })).toBe(false);
      expect(dialog).toHaveFocus();
    }
  });

  it("does not process descendant native cancel, close, or form submission as its own", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => false);
    render(<DialogHost onConfirm={confirm} />);
    await user.click(screen.getByRole("button", { name: "打开确认" }));
    await user.type(screen.getByRole("textbox", { name: /操作原因/ }), "有效原因");
    const dialog = screen.getByRole("dialog");
    const child = document.createElement("dialog");
    const childForm = document.createElement("form");
    child.append(childForm);
    dialog.append(child);
    fireEvent(child, new Event("cancel", { bubbles: true, cancelable: true }));
    fireEvent(child, new Event("close", { bubbles: true }));
    fireEvent.submit(childForm);
    expect(dialog).toHaveAttribute("open");
    expect(confirm).not.toHaveBeenCalled();
    child.remove();
  });

  it("restores an eligible caller fallback when the trigger becomes disabled", async () => {
    const user = userEvent.setup();
    render(<DialogHost onConfirm={() => false} />);
    const trigger = screen.getByRole("button", { name: "打开确认" });
    await user.click(trigger);
    trigger.setAttribute("disabled", "");
    await user.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "所属标题" })).toHaveFocus());
  });

  it("keeps the scroll lock until the final overlay closes and restores its previous value", async () => {
    document.documentElement.style.setProperty("overflow", "auto", "important");
    const first = render(<DialogHost onConfirm={() => false} />);
    const second = render(<DialogHost onConfirm={() => false} />);
    fireEvent.click(first.container.querySelector("button")!);
    fireEvent.click(second.container.querySelector("button")!);
    expect(document.documentElement.style.overflow).toBe("hidden");
    first.unmount();
    expect(document.documentElement.style.overflow).toBe("hidden");
    second.unmount();
    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.documentElement.style.getPropertyPriority("overflow")).toBe("important");
    document.documentElement.style.removeProperty("overflow");
  });

  it.each([false, true])("isolates owned Escape from document listeners (busy=%s)", async (busy) => {
    const user = userEvent.setup();
    render(<DialogHost onConfirm={() => false} busy={busy} />);
    await user.click(screen.getByRole("button", { name: "打开确认" }));
    const parentEscape = vi.fn();
    document.addEventListener("keydown", parentEscape);
    try {
      const dialog = screen.getByRole("dialog");
      expect(fireEvent.keyDown(dialog, { key: "Escape", cancelable: true })).toBe(!busy);
      expect(parentEscape).not.toHaveBeenCalled();
      // jsdom has no native Escape default action; exercise cancel separately.
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      expect(dialog.hasAttribute("open")).toBe(busy);
    } finally {
      document.removeEventListener("keydown", parentEscape);
    }
  });

  it("submits by keyboard once, traps focus, and restores the trigger", async () => {
    const user = userEvent.setup();
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { release = resolve; });
    const onConfirm = vi.fn(() => pending);
    render(<DialogHost onConfirm={onConfirm} />);

    const trigger = screen.getByRole("button", { name: "打开确认" });
    await user.click(trigger);
    const reason = screen.getByRole("textbox", { name: /操作原因/ });
    const confirm = screen.getByRole("button", { name: "确认执行" });
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(confirm).toBeDisabled();

    await user.type(reason, "复核通过");
    expect(confirm).toBeEnabled();
    confirm.focus();
    await user.tab();
    expect(reason).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();

    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("复核通过");
    await act(async () => { release(true); await pending; });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps focus on the busy dialog and prevents repeated Escape default closing", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => false);
    const { rerender } = render(<DialogHost onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "打开确认" }));
    await user.type(screen.getByRole("textbox", { name: /操作原因/ }), "有效原因");
    // Commit user-event's pending textarea change before busy moves focus in an effect.
    await user.tab();
    await act(async () => { rerender(<DialogHost onConfirm={onConfirm} busy />); });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    for (let index = 0; index < 4; index++) {
      expect(fireEvent.keyDown(dialog, { key: "Escape", cancelable: true })).toBe(false);
      expect(dialog).toHaveAttribute("open");
    }
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "正在提交…" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("validates trimmed reason bounds before calling the mutation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => false);
    render(<DialogHost onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "打开确认" }));
    const reason = screen.getByRole("textbox", { name: /操作原因/ });
    const confirm = screen.getByRole("button", { name: "确认执行" });
    for (const value of ["   ", " 一 ", "字".repeat(501)]) {
      fireEvent.change(reason, { target: { value } });
      expect(confirm).toBeDisabled();
      fireEvent.submit(reason.closest("form")!);
      expect(onConfirm).not.toHaveBeenCalled();
    }
    fireEvent.change(reason, { target: { value: "字".repeat(500) } });
    expect(confirm).toBeEnabled();
    fireEvent.change(reason, { target: { value: "  原因  " } });
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("原因");
    expect(reason).toHaveValue("  原因  ");
    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: "打开确认" }));
    expect(screen.getByRole("textbox", { name: /操作原因/ })).toHaveValue("");
  });

  it("keeps the dialog open when confirmation returns false", async () => {
    const user = userEvent.setup();
    render(<DialogHost onConfirm={() => false} />);
    await user.click(screen.getByRole("button", { name: "打开确认" }));
    await user.type(screen.getByRole("textbox", { name: /操作原因/ }), "拒绝关闭");
    await user.click(screen.getByRole("button", { name: "确认执行" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });
});

describe("S-03 HomestayStayActions adoption", () => {
  it("routes a mounted credential-loss confirmation to the real mutation boundary", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn(async (_endpoint: string, _body?: unknown) => true);
    const capability = {
      moduleAvailable: true,
      invalidationKey: "tenant:park",
      actionAllowed: (action: string) => action === "homestay.stays.return-credential"
    } as unknown as PropertyCapabilityProjection;
    const data = {
      booking: {
        id: "booking-1", bookingCode: "HS-001", status: "checked_in",
        arrivalDate: "2099-01-01", departureDate: "2099-01-02"
      },
      guests: [],
      credentials: [{ id: "credential-1", credentialLabel: "A101 房卡", status: "issued" }]
    } as unknown as HomestayBookingDetailResponse;

    function RefreshHost() {
      const [snapshot, setSnapshot] = useState(data);
      const heading = useRef<HTMLHeadingElement>(null);
      return <>
        <h1 tabIndex={-1} ref={heading}>入住详情</h1>
        <HomestayStayActions capability={capability} data={snapshot} fallbackFocusRef={heading}
          mutate={async (endpoint, body) => {
            await mutate(endpoint, body);
            setSnapshot({ ...data, credentials: [] });
            return true;
          }} busy={false} errorMessage="" />
      </>;
    }
    render(<RefreshHost />);
    await user.click(screen.getByRole("button", { name: "登记遗失" }));
    await user.type(screen.getByRole("textbox", { name: /遗失原因/ }), "住客确认遗失");
    await user.click(screen.getByRole("button", { name: "确认登记遗失" }));

    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      "/homestay/bookings/booking-1/credentials/credential-1/lost",
      { reason: "住客确认遗失" }
    ));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("heading", { name: "入住详情" })).toHaveFocus());
    expect(screen.queryByRole("button", { name: "登记遗失" })).not.toBeInTheDocument();
  });
});
