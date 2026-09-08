import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserContext } from "@jinhu/shared";
import { describe, expect, it } from "vitest";
import { listPreferenceKey, useListPreferences } from "@/lib/list-preferences";

const scope = { id: "user-1", tenant_id: "tenant-1", park_id: "park-1" } as UserContext;

function PreferenceHost({ user = scope }: { user?: UserContext }) {
  const { preferences, setFiltersOpen } = useListPreferences("leasing.receivables", user);
  return <button type="button" onClick={() => setFiltersOpen(!preferences.filtersOpen)}>{preferences.filtersOpen ? "展开" : "收起"}</button>;
}

describe("useListPreferences", () => {
  it("persists a preference and restores it after remount", async () => {
    localStorage.clear();
    const keyboard = userEvent.setup();
    const first = render(<PreferenceHost />);
    await keyboard.click(screen.getByRole("button", { name: "展开" }));
    expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();
    first.unmount();
    render(<PreferenceHost />);
    await waitFor(() => expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument());
  });

  it("isolates park scope and ignores invalid or stale payloads", async () => {
    localStorage.clear();
    const key = listPreferenceKey("leasing.receivables", scope)!;
    localStorage.setItem(key, "{bad json");
    const view = render(<PreferenceHost />);
    await waitFor(() => expect(screen.getByRole("button", { name: "展开" })).toBeInTheDocument());
    localStorage.setItem(key, JSON.stringify({ version: 0, filtersOpen: false }));
    view.rerender(<PreferenceHost user={{ ...scope, park_id: "park-2" }} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "展开" })).toBeInTheDocument());
    expect(listPreferenceKey("leasing.receivables", { ...scope, park_id: "park-2" })).not.toBe(key);
  });
});
