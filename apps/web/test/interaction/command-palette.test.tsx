import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserContext } from "@jinhu/shared";
import { describe, expect, it, vi } from "vitest";
import { AuthUserContext } from "@/lib/auth-context";
import { CommandPalette } from "@/components/layout/CommandPalette";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const userContext = {
  id: "user-1", tenant_id: "tenant-1", park_id: "park-1",
  menu_tree: [{ label: "资产管理", module: "asset", children: [{ label: "房源管理", href: "/assets/units", permission: "asset:unit:list", module: "asset" }] }],
  permissions: ["asset:unit:list"], enabled_modules: [{ module_code: "asset", enabled: true }]
} as unknown as UserContext;

describe("CommandPalette mounted interactions", () => {
  it("opens with keyboard, exposes only projected menus, navigates, and restores focus", async () => {
    const keyboard = userEvent.setup();
    render(<AuthUserContext.Provider value={userContext}><CommandPalette /></AuthUserContext.Provider>);
    const trigger = screen.getByRole("button", { name: "打开全局导航" });
    await keyboard.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "全局导航" })).toBeInTheDocument();
    const input = screen.getByRole("combobox", { name: "搜索可访问页面" });
    expect(input).toHaveFocus();
    await keyboard.type(input, "房源");
    expect(screen.getByRole("option", { name: /房源管理/ })).toBeInTheDocument();
    expect(screen.queryByText("应收账单")).not.toBeInTheDocument();
    await keyboard.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/assets/units");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes with Escape and resets when park scope changes", async () => {
    const keyboard = userEvent.setup();
    const view = render(<AuthUserContext.Provider value={userContext}><CommandPalette /></AuthUserContext.Provider>);
    await keyboard.click(screen.getByRole("button", { name: "打开全局导航" }));
    const input = screen.getByRole("combobox", { name: "搜索可访问页面" });
    await keyboard.tab({ shift: true });
    expect(screen.getAllByRole("option").at(-1)).toHaveFocus();
    await keyboard.tab();
    expect(input).toHaveFocus();
    await keyboard.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "打开全局导航" })).toHaveFocus());
    await keyboard.click(screen.getByRole("button", { name: "打开全局导航" }));
    view.rerender(<AuthUserContext.Provider value={{ ...userContext, park_id: "park-2", menu_tree: [] }}><CommandPalette /></AuthUserContext.Provider>);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
