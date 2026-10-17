import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SYSTEM_PERMISSIONS as P, type UserMenuTreeNode } from "@jinhu/shared";
import { EnterpriseClient } from "../../app/enterprise/EnterpriseClient";
import { MessagesClient } from "../../app/workflow/messages/MessagesClient";
import { useScopedOperation } from "../../lib/use-scoped-operation";
import type * as ApiClient from "../../lib/api-client";
import { ApiError, apiRequest } from "../../lib/api-client";

const auth = vi.hoisted(() => ({ user: { id: "actor", tenant_id: "tenant", park_id: "scope", runtime_mode: "hr_enterprise", permissions: [] as string[], menu_tree: [] as UserMenuTreeNode[], enabled_modules: [{ module_code: "system", enabled: true }, { module_code: "workflow", enabled: true }] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => auth.user }));
vi.mock("../../lib/auth", () => ({ getToken: () => "synthetic-test-token" }));
vi.mock("../../lib/api-client", async () => ({ ...await vi.importActual<typeof ApiClient>("../../lib/api-client"), apiRequest: vi.fn() }));
const member = { id: "11111111-1111-4111-8111-111111111111", username: "member", displayName: "合成成员", status: "enabled", version: 1, roles: [] };
function reply(data: unknown) { return { data } as Awaited<ReturnType<typeof apiRequest>>; }

beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { ...auth.user, id: "actor", park_id: "scope", permissions: [P.USER_LIST], menu_tree: [], enabled_modules: [{ module_code: "system", enabled: true }, { module_code: "workflow", enabled: true }, { module_code: "hr", enabled: true }] };
  vi.mocked(apiRequest).mockResolvedValue(reply({ items: [member], total: 1, page: 1, page_size: 20 }));
});

function Harness({ scope = "scope", committed = () => undefined }: { scope?: string; committed?: () => void }) {
  const operation = useScopedOperation(scope);
  return <><button disabled={operation.locked} onClick={() => operation.write("/enterprise/roles", "POST", { name: "原草稿" }, (value) => Boolean(value && typeof value === "object" && (value as { version?: unknown }).version === 1), committed)}>保存</button>{operation.pending ? <button disabled={operation.writing} onClick={operation.retry}>重试原请求</button> : null}<p role="alert">{operation.error}</p><p role="status">{operation.success}</p></>;
}

it("retains exact ambiguous request and rejects duplicate clicks while retrying", async () => {
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("网络中断")).mockResolvedValueOnce(reply({ version: 1 }));
  const committed = vi.fn(); render(<Harness committed={committed} />);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByRole("button", { name: "重试原请求" });
  expect(apiRequest).toHaveBeenCalledTimes(1);
  const original = vi.mocked(apiRequest).mock.calls[0];
  fireEvent.click(screen.getByRole("button", { name: "重试原请求" }));
  await waitFor(() => expect(committed).toHaveBeenCalledTimes(1));
  expect(vi.mocked(apiRequest).mock.calls[1]).toEqual(original);
  expect(screen.getByRole("status")).toHaveTextContent("操作已保存");
});

it("does not report an invalid success receipt as a completed write", async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(reply({ version: 99 }));
  const committed = vi.fn(); render(<Harness committed={committed} />);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByRole("button", { name: "重试原请求" });
  expect(committed).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("");
});

it("keeps a definite version conflict editable and does not retain ambiguous retry", async () => {
  vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError("版本已变更", 409)); render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText("版本已变更");
  expect(screen.queryByRole("button", { name: "重试原请求" })).toBeNull();
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
});

it("ignores a late write receipt after switching enterprise", async () => {
  let finish!: (value: Awaited<ReturnType<typeof apiRequest>>) => void;
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const committed = vi.fn(); const view = render(<Harness scope="one" committed={committed} />);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  view.rerender(<Harness scope="two" committed={committed} />);
  await act(async () => finish(reply({ version: 1 })));
  expect(committed).not.toHaveBeenCalled(); expect(screen.getByRole("status")).toHaveTextContent("");
});

it("read-only member access does not call role or permission administration endpoints", async () => {
  render(<EnterpriseClient />); await screen.findByText("合成成员");
  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(vi.mocked(apiRequest).mock.calls[0]![0]).toContain("/enterprise/members?");
  expect(screen.queryByRole("button", { name: "创建成员" })).toBeNull();
  expect(screen.queryByRole("button", { name: "维护成员" })).toBeNull();
});

it("a role author reaches its own operation without unrelated member-list access", async () => {
  auth.user.permissions = [P.ROLE_CREATE, P.ROLE_ASSIGN_PERMISSIONS];
  vi.mocked(apiRequest).mockResolvedValue(reply([]));
  render(<EnterpriseClient />);
  await waitFor(() => expect(screen.getByRole("button", { name: "创建角色" })).toBeEnabled());
  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(vi.mocked(apiRequest).mock.calls[0]![0]).toBe("/enterprise/permissions");
  expect(screen.getByRole("option", { name: "本人" })).toBeVisible();
  expect(screen.queryByRole("option", { name: "本企业" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "企业成员" })).toBeNull();
  expect(screen.queryByRole("button", { name: "创建成员" })).toBeNull();
});

it("a member creator reaches its role selector without member-list or permission-catalog reads", async () => {
  auth.user.permissions = [P.USER_CREATE, P.USER_ASSIGN_ROLES];
  vi.mocked(apiRequest).mockResolvedValue(reply([{ id: member.id, name: "专员", code: "staff", version: 1, dataScope: "self" }]));
  render(<EnterpriseClient />); await screen.findByLabelText("专员");
  expect(apiRequest).toHaveBeenCalledTimes(1);
  expect(vi.mocked(apiRequest).mock.calls[0]![0]).toBe("/enterprise/roles");
  expect(screen.queryByRole("heading", { name: "企业成员" })).toBeNull();
});

it("member pages remain reachable and a live read denial clears cached members", async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(reply({ items: [member], total: 21, page: 1, page_size: 20 })).mockRejectedValueOnce(new ApiError("成员权限已撤回", 403));
  render(<EnterpriseClient />); await screen.findByText("合成成员");
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await screen.findByText(/成员权限已撤回/);
  expect(vi.mocked(apiRequest).mock.calls[1]![0]).toContain("page=2");
  expect(screen.queryByText("合成成员")).toBeNull();
});

it("own messages paginate and keep committed mark-read separate from refresh failure", async () => {
  const message = { id: member.id, title: "合成通知", content: "通知正文", readAt: null, createTime: "2026-10-17", senderName: "HR" };
  vi.mocked(apiRequest).mockResolvedValueOnce(reply({ items: [message], total: 21, page: 1, page_size: 20 }))
    .mockResolvedValueOnce(reply({ ...message, readAt: "2026-10-17T00:00:00Z" }))
    .mockRejectedValueOnce(new Error("刷新暂不可用"));
  render(<MessagesClient />); await screen.findByText("合成通知");
  fireEvent.click(screen.getByRole("button", { name: "标为已读" }));
  await screen.findByText(/刷新暂不可用/);
  expect(screen.getByText(/操作已保存/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "重试原请求" })).toBeNull();
  expect(apiRequest).toHaveBeenCalledTimes(3);
});

it("member create preserves a rejected draft then clears it after commit even when refresh fails", async () => {
  auth.user.permissions = [P.USER_LIST, P.USER_CREATE, P.USER_ASSIGN_ROLES];
  let reads = 0, writes = 0;
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (options?.method === "POST") {
      writes++;
      if (writes === 1) throw new ApiError("账号已存在", 409);
      return reply({ id: member.id, version: 1 });
    }
    if (path === "/enterprise/roles") return reply([{ id: member.id, code: "staff", name: "专员", version: 1, dataScope: "self" }]);
    if (++reads > 1) throw new Error("刷新读取暂不可用");
    return reply({ items: [member], total: 1, page: 1, page_size: 20 });
  });
  render(<EnterpriseClient />); await screen.findByLabelText("专员");
  fireEvent.change(screen.getByLabelText("账号"), { target: { value: "new.staff" } });
  fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "合成新成员" } });
  fireEvent.change(screen.getByLabelText("初始密码"), { target: { value: "synthetic-only-1234" } });
  fireEvent.change(screen.getByLabelText("办理原因"), { target: { value: "合成办理原因" } });
  fireEvent.click(screen.getByLabelText("专员"));
  fireEvent.click(screen.getByRole("button", { name: "创建成员" }));
  await screen.findByText("账号已存在"); expect(screen.getByLabelText("姓名")).toHaveValue("合成新成员");
  fireEvent.click(screen.getByRole("button", { name: "创建成员" }));
  await screen.findByText(/刷新读取暂不可用/);
  expect(screen.getByText(/操作已保存/)).toBeVisible();
  expect(screen.getByLabelText("初始密码")).toHaveValue("");
  expect(screen.getByLabelText("姓名")).toHaveValue("");
  expect(writes).toBe(2);
});

const messageTargets = [
  { target: "/hr/work-reports", permission: true, module: true, menu: true, visible: true },
  { target: "/hr/work-reports?view=mine#reports", permission: true, module: true, menu: true, visible: true },
  { target: "/hr/work-reports", permission: false, module: true, menu: true, visible: false },
  { target: "/hr/work-reports", permission: true, module: false, menu: true, visible: false },
  { target: "/hr/work-reports", permission: true, module: true, menu: false, visible: false },
  { target: "https://example.com/hr/work-reports", permission: true, module: true, menu: true, visible: false },
  { target: "//example.com/hr/work-reports", permission: true, module: true, menu: true, visible: false },
  { target: "/hr/../hr/work-reports", permission: true, module: true, menu: true, visible: false },
  { target: "/assets/units", permission: true, module: true, menu: true, visible: false },
  { target: "/hr/work-reports" + String.fromCharCode(9), permission: true, module: true, menu: true, visible: false },
  { target: "/hr/" + String.fromCharCode(92) + "work-reports", permission: true, module: true, menu: true, visible: false },
  { target: undefined, permission: true, module: true, menu: true, visible: false },
];
it.each(messageTargets)("message business entry respects its actual HR route and access: %j", async ({ target, permission, module, menu, visible }) => {
  auth.user.permissions = permission ? [P.HR_WORK_REPORTS_PAGE] : [];
  auth.user.enabled_modules.find(item => item.module_code === "hr")!.enabled = module;
  auth.user.menu_tree = menu ? [{ label: "工作汇报", href: "/hr/work-reports", permission: P.HR_WORK_REPORTS_PAGE, module: "hr" }] : [];
  vi.mocked(apiRequest).mockResolvedValue(reply({ items: [{ id: member.id, title: "待办理工作汇报", content: null, readAt: null, createTime: "2026-10-17", senderName: null, targetUrl: target }], total: 1, page: 1, page_size: 20 }));
  render(<MessagesClient />); await screen.findByText("待办理工作汇报");
  const link = screen.queryByRole("link", { name: "查看业务" });
  if (visible) expect(link).toHaveAttribute("href", target);
  else expect(link).toBeNull();
  expect(screen.getByRole("button", { name: "标为已读" })).toBeVisible();
  expect(apiRequest).toHaveBeenCalledTimes(1);
});
