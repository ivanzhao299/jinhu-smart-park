import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RemoteEntityPicker } from "@/features/property-shared/picker/RemoteEntityPicker";
import type { RemoteEntityLoader, RemoteEntityOption } from "@/features/property-shared/picker/types";

const options: RemoteEntityOption[] = [
  { id: "unit-disabled", label: "A-100", disabledReason: "不可用" },
  { id: "unit-101", label: "A-101 · 湖景房" },
  { id: "unit-102", label: "A-102 · 园景房" }
];

const loader: RemoteEntityLoader = async ({ page, pageSize }) => ({
  items: options,
  page,
  pageSize,
  total: options.length
});

function PickerHost() {
  const [value, setValue] = useState<RemoteEntityOption | null>(null);
  return <>
    <RemoteEntityPicker
      authorized contextValid invalidationKey="scope-1" label="住房房源"
      loadOptions={loader} onChange={setValue} value={value}
    />
    <button type="button" onClick={() => setValue({ id: "external", label: "外部回显房源" })}>
      设置外部值
    </button>
    <output>{value?.id ?? "none"}</output>
  </>;
}

describe("RemoteEntityPicker mounted interactions", () => {
  it("selects with keyboard, skips disabled options, clears, and reflects external values", async () => {
    const user = userEvent.setup();
    render(<PickerHost />);
    const input = screen.getByRole("combobox", { name: "住房房源" });

    await user.click(input);
    await user.type(input, "A1");
    await screen.findByRole("option", { name: /A-101/ });
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining("option-1"));
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("A-101 · 湖景房");
    expect(screen.getByText("unit-101")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "清除住房房源" }));
    expect(input).toHaveValue("");
    expect(screen.getByText("none")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设置外部值" }));
    await waitFor(() => expect(input).toHaveValue("外部回显房源"));
    expect(screen.getByText("external")).toBeInTheDocument();
  });

  it("selects a later enabled option with ArrowDown and Escape closes results", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RemoteEntityPicker authorized contextValid invalidationKey="scope-2"
      label="租客" loadOptions={loader} onChange={onChange} value={null} />);
    const input = screen.getByRole("combobox", { name: "租客" });
    await user.type(input, "园景");
    await screen.findByRole("option", { name: /A-102/ });
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining("option-2"));
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(options[2]);
    await user.click(input);
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
