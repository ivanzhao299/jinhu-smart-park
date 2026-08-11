# PR223 Windows 真实页面 UAT 验收

## Goal

在 Windows 原生 Codex Desktop 会话中，使用本机 Google Chrome 或 Codex 内置浏览器，
连接由本机仓库代码启动的隔离 API、Web 和 PostgreSQL 测试栈，对 GitHub PR #223 最终
合并版本涉及的民宿、住房出租及共享房产控制面执行真实页面 UAT，形成可审计、可复核、
可交接的独立证据包。不得连接线上生产环境。

## Authority

- PR：https://github.com/ivanzhao299/jinhu-smart-park/pull/223
- PR head：`6a41149913f32683472aafd6acabe7d04bec7bb5`
- merge commit：`28d5e517d5a186908dc549cf3c527701be13613b`
- 旧技术证据 SHA：`15b6e8f6edd12759dc35b1675f851c9a0bc52c0c`，仅可作为祖先证据引用，
  不得据此把 PR223 最终 head 标记为浏览器 UAT PASS。

执行前必须核对本地待测 worktree commit，使用专用本地数据库和配置启动服务，并记录
commit、依赖锁、迁移、端口和启动日志；代码或隔离环境无法绑定时保持 `BLOCKED`。

## Requirements

- 以 PR223 最终合并内容和 review-fix 回归点为主范围；原 PR192 人工 UAT 仅提供角色、
  安全边界和历史场景来源。
- 测试必须访问本机服务真实渲染页面，不得以静态代码检查、API 冒烟、模拟页面、本地文件 URI、
  Playwright 或截图回放代替浏览器验收。
- 本地环境必须使用专用测试数据库和本地测试账号；禁止复用生产数据库、生产密钥、
  生产账号、线上域名或线上文件存储。
- 首选本机 Google Chrome；内置浏览器只用于普通页面补充复核。原 Chrome 15 项环境缺口、
  文件上传和现有 Chrome profile 场景必须使用本机 Chrome。
- 覆盖民宿/住房 17 个 canonical 工作台、Party/身份/通知/审批异常/事件异常控制面、共享
  task/approval runtime、附件、权限管理和 PR223 最终 review-fix 交互。
- 覆盖桌面、390px，以及指定 320/768 场景；包含键盘、缩放、权限隔离、弱网/离线、
  幂等锁、版本冲突和关键写操作安全验证。
- 每个 case 记录环境、PR/build 身份、账号角色、URL、步骤、预期、实际、截图或录像、
  时间、结果及缺陷编号。
- 写操作仅限专用本地测试数据库，统一使用可识别前缀；可以验证完整业务链路，但必须记录
  初始状态、幂等结果和清理 residual=0，不得让本地配置指向任何线上资源。
- 发现缺陷只记录、分级和复验，不在本任务中直接修改产品代码。

## Acceptance Criteria

- [ ] Trellis 任务保持 `planning`，并包含完整 `prd.md`、`design.md`、`implement.md`。
- [ ] 证据明确绑定 PR #223、最终 head、merge commit 和本地待测 commit/启动参数。
- [ ] 旧 PR192 浏览器证据只作历史基线，新结果写入独立 PR223 run，不改写旧记录。
- [ ] 覆盖 17 个业务工作台、共享控制面和 PR223 review-fix 回归矩阵。
- [ ] 原 Chrome 15 项缺口在 PR223 本地服务上逐项重跑，且 15/15 有新 Chrome 证据。
- [ ] 明确 Chrome/内置浏览器边界、响应式/无障碍、证据命名、缺陷分级和退出条件。
- [ ] 包含本地隔离门禁、测试数据前缀、清理 residual=0 和严重异常停止条件。
- [ ] Windows 交接文档已保存到指定 D 盘目录，可在新会话中独立接管。
- [ ] 浏览器完成状态与真人岗位样本、业务/财务/安全/审计/发布签署严格分开。

## Out of Scope

- 本规划会话不实际执行本地 UAT，也不提前运行 `task.py start`。
- 不代替真人岗位样本或任何具名签署，不单独声明 `production_ready`。
- 不补做 PR223 的 CI、rollback 19/19 或 formal performance 30/30；浏览器 UAT 不修复或
  追认 PR 集成门禁的历史豁免。
- 不连接或修改线上生产配置、权限、账号、数据库、文件存储或业务数据。

## Confirmed Context

- PR #223 已于 2026-08-08 合并到 `main`；本轮明确改为本机启动隔离测试环境，
  不访问已经部署的线上系统。
- PR223 是 PR192 产品化改造的最终集成入口，同时包含合并冲突裁决和后续 review-fix；
  因此本任务不是“重做 PR192 UAT”，而是针对 PR223 最终交付做新一轮真实页面验收。
- 2026-08-04 的 15 项 Chrome 场景因 Linux `sandboxCwd`/本地 URI 环境阻塞；本次以
  Windows 本机 Chrome 消除该环境阻塞，但历史 `BLOCKED` 记录保持不变。
