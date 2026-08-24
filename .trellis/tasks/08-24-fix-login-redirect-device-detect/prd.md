# 修复登录跳转设备误判

## Goal

修复宽屏触屏笔记本登录后被误判为移动现场设备、进而把拥有工程权限的平台管理员跳转到 `/engineering/terminal` 的问题，同时保持真手机和窄视口现场工作流不回退，并完成 GitHub Issue、PR、审查、合并及生产部署工作流验证闭环。

## Confirmed Facts

- `resolvePostLoginPath` 是登录成功后的唯一落点解析入口，`apps/web/app/login/page.tsx` 在建立会话后调用它。
- 设备判定由提交 `7323975c` 引入。`viewportWidth <= 900`、coarse pointer、`maxTouchPoints > 0`、移动 UA 当前以 OR 关系判定移动工作台；后续提交未改变该设备判定。
- 初始测试中的移动设备同时具备窄视口、coarse pointer、触摸点和移动 UA；没有证明“仅触摸点大于零”应独立进入移动终端。
- 平台超级管理员通过 `is_super`/`*` 获得全部权限；当工程模块启用时，被误判为移动设备后会优先进入 `/engineering/terminal`。
- 文档将 `/dashboard` 作为桌面登录后的首页/驾驶舱路径，将 `/engineering/terminal` 和 `/operations/terminal` 定义为 390px 级、角色驱动的现场终端。
- `viewportWidth <= 900` 是既有移动优先契约，并曾用于 800px 回归用例。本次保留窄视口为移动工作台信号。
- 桌面落点读取后端 `menu_tree` 的首个可访问菜单。排序存在契约不足风险，但目前没有真实响应或产品证据证明本次报告由菜单顺序造成，因此不重排菜单。

## Decision Matrix

表中“首菜单”均指首个同时满足权限和已启用模块的菜单，缺失时回退 `/dashboard`；平台超管桌面的标准菜单树首项预期为 `/dashboard`。

| 设备 | 平台超管 | 租户管理员 | 工程岗 | 安全巡检岗 | 工单岗 / 普通账号 / BASIC 新租户首管 |
| --- | --- | --- | --- | --- | --- |
| 真手机（窄视口/coarse/移动 UA） | 工程模块优先 `/engineering/terminal`，否则安全终端或首菜单 | 有对应终端契约才进终端，否则首菜单 | `/engineering/terminal` | `/operations/terminal` | 首菜单或 `/dashboard` |
| 宽屏触屏笔记本（fine pointer、宽度 ≥1200、桌面 UA、touchPoints >0）修复前 | 工程启用时误进 `/engineering/terminal` | 按移动分支 | 误进 `/engineering/terminal` | 误进 `/operations/terminal` | 首菜单或 `/dashboard` |
| 宽屏触屏笔记本修复后 | 桌面首菜单，标准超管为 `/dashboard` | 桌面首菜单 | 桌面首菜单；无菜单时 `/engineering` | 桌面首菜单或 `/dashboard` | 桌面首菜单或 `/dashboard` |
| 窄窗口桌面（≤900）修复前后 | 保持移动分支；工程启用时 `/engineering/terminal` | 有对应终端契约才进终端，否则首菜单 | `/engineering/terminal` | `/operations/terminal` | 首菜单或 `/dashboard` |
| 普通桌面（宽视口、fine、无触摸、桌面 UA）修复前后 | 桌面首菜单，标准超管为 `/dashboard` | 桌面首菜单 | 桌面首菜单；无菜单时 `/engineering` | 桌面首菜单或 `/dashboard` | 桌面首菜单或 `/dashboard` |

## Requirements

- 仅收紧 `prefersMobileWorkbench` 的触摸点判定：`touchPoints > 0` 不得单独构成移动工作台信号。
- 保留宽度 `<= 900`、coarse pointer、移动 UA 任一信号的现有行为，保证真手机和窄窗口的现场终端路径不回退。
- 平台超管在宽屏、fine pointer、桌面 UA 的触屏笔记本上必须走桌面菜单落点；标准 `/dashboard` 首菜单时落到驾驶舱。
- 不改变终端权限优先级、模块检查、首个可访问菜单算法或菜单排序。
- 代码范围限于 `apps/web/lib/post-login-route.ts` 和 `apps/web/lib/post-login-route.spec.ts`；仅在确有必要时修改登录页。
- 创建中文 GitHub Issue，正文包含复现、根因、决策矩阵、方案与验收标准；PR 使用 `Closes #<issue>`，经 Codex review、CI、squash merge 和生产部署工作流验证。
- 不直接操作生产环境，不伪造浏览器验证；缺少可用浏览器或认证条件时明确记录限制。
- 唯一允许 push 的功能分支为 `codex/fix-login-redirect-device-detect`，不得 force push。

## Acceptance Criteria

- [ ] 宽度至少 1200、fine pointer、桌面 UA、`touchPoints=10` 的设备不会因触摸点单独进入 terminal。
- [ ] 同类设备上的平台超管在首菜单为 `/dashboard` 时落到 `/dashboard`。
- [ ] 390px、coarse pointer、移动 UA 的工程用户仍进入 `/engineering/terminal`。
- [ ] `<=900px` 的工程用户仍按既有契约进入 `/engineering/terminal`，即使 pointer fine、touchPoints 为 0、UA 为桌面浏览器。
- [ ] 安全巡检、工单-only、无终端权限、新租户首管的现有授权回退语义保持不变。
- [ ] 仓库约定的 `pnpm --filter @jinhu/web test:unit:auth-routing`、Web typecheck 和 Web lint 通过。
- [ ] GitHub Issue 与 PR 建立关联，Codex review 无未解决重大意见，PR CI 全绿并 squash merge。
- [ ] main 的 CI 与 Deploy Production 工作流成功，健康检查和 Docker 部署后清理步骤有日志证据。
- [ ] Issue 已关闭；Trellis 任务按实际验收状态更新，浏览器验证若未完成则保留 `in_progress` 并注明。

## Out of Scope

- 重排后端菜单、改变桌面“首个可访问菜单”产品策略或新增角色专属桌面首页。
- 修改 API、共享权限契约、数据库、迁移、seed、部署脚本或生产配置。
- 对生产环境执行任何直接命令或数据操作。

## Evidence

- `apps/web/lib/post-login-route.ts`
- `apps/web/lib/post-login-route.spec.ts`
- `apps/web/app/login/page.tsx`
- `docs/testing/s1-self-test.md`
- `docs/uat/go-live-browser-uat.md`
- `docs/uat/mobile-terminal-product-closure.md`
- `docs/uat/engineering-terminal-role-uat.md`
- `docs/release/EXECUTIVE_DASHBOARD_ACCURACY_PRODUCTION_GATE16_REPORT.md`
- Git history: `7323975c`, `696873aa`, `e530ed21`
- GitHub Issue: `#343`

## Notes

- 这是局部纯函数和单测的最小修复，采用 PRD-only 轻量任务；Issue/PR/部署闭环是交付流程，不扩大实现设计复杂度。
- 裸 `node --test apps/web/lib/post-login-route.spec.ts` 在本机 Node 24 下无法解析无扩展名 TypeScript import；实际验证使用 `apps/web/package.json` 已定义且 CI 兼容的 `test:unit:auth-routing` 脚本。
