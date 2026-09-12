import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConsequenceDialog } from "@/features/property-shared/dialog/ConsequenceDialog";
import { HomestayStayActions } from "@/app/homestay/_components/HomestayStayActions";
import type { HomestayBookingDetailResponse } from "@jinhu/shared";
import type { PropertyCapabilityProjection } from "@/features/property-shared";

function DialogHost({ onConfirm, busy = false }: { onConfirm(reason?: string): boolean | Promise<boolean>; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>打开确认</button>
    <ConsequenceDialog
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
    release(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps focus on the busy dialog and prevents repeated Escape default closing", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => false);
    const { rerender } = render(<DialogHost onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "打开确认" }));
    await user.type(screen.getByRole("textbox", { name: /操作原因/ }), "有效原因");
    rerender(<DialogHost onConfirm={onConfirm} busy />);
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
    const mutate = vi.fn(async () => true);
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

    render(<HomestayStayActions capability={capability} data={data} mutate={mutate} busy={false} errorMessage="" />);
    await user.click(screen.getByRole("button", { name: "登记遗失" }));
    await user.type(screen.getByRole("textbox", { name: /遗失原因/ }), "住客确认遗失");
    await user.click(screen.getByRole("button", { name: "确认登记遗失" }));

    await waitFor(() => expect(mutate).toHaveBeenCalledWith(
      "/homestay/bookings/booking-1/credentials/credential-1/lost",
      { reason: "住客确认遗失" }
    ));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
