import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  DynamicBreadcrumbProvider,
  useDynamicBreadcrumbLabel,
  usePublishDynamicBreadcrumbLabel
} from "@/lib/dynamic-breadcrumb";

function Publisher({ label }: { label: string | null }) {
  usePublishDynamicBreadcrumbLabel(label);
  return null;
}

function Host() {
  const [label, setLabel] = useState<string | null>(null);
  return <DynamicBreadcrumbProvider>
    <Publisher label={label} />
    <Reader />
    <button type="button" onClick={() => setLabel("租约 H-001")}>发布</button>
    <button type="button" onClick={() => setLabel(null)}>清除</button>
  </DynamicBreadcrumbProvider>;
}

function Reader() {
  return <output>{useDynamicBreadcrumbLabel() ?? "fallback"}</output>;
}

describe("DynamicBreadcrumbProvider", () => {
  it("publishes an authorized detail label and clears back to safe fallback", async () => {
    const keyboard = userEvent.setup();
    render(<Host />);
    expect(screen.getByText("fallback")).toBeInTheDocument();
    await keyboard.click(screen.getByRole("button", { name: "发布" }));
    expect(screen.getByText("租约 H-001")).toBeInTheDocument();
    await keyboard.click(screen.getByRole("button", { name: "清除" }));
    expect(screen.getByText("fallback")).toBeInTheDocument();
  });
});
