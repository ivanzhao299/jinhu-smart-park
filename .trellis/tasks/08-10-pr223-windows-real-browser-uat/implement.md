# PR223 Windows 真实页面 UAT 执行计划

> 【已执行的历史计划，不得重新启动全量矩阵】
> 本计划已由 Windows Google Chrome Profile 1 在本地隔离环境执行：Chrome 15 项
> 15 PASS / 0 FAIL，UAT-002 已解决，总矩阵 47 PASS / 0 FAIL / 1 BLOCKED，residual=0。
> 下方未回填的复选框保留原始执行计划形态，不表示这些阶段仍待执行；当前唯一允许的后续动作是
> 修正本地 fixture 后复测 P2 `ENV-001 / ROLE-NEG-01`。当前权威状态见 `task.json`，不得重复
> 已通过场景、覆盖历史证据、冒充真实 Chrome 操作或声明 `production_ready`。

## Phase 0 — 接管、代码身份与本地隔离预检

- [ ] 完整阅读 `prd.md`、`design.md` 和外部交接文档。
- [ ] 确认当前 agent 是 Windows native，证据目录是 Windows 本地 `D:` 路径。
- [ ] 记录 Windows、Chrome、Codex Desktop 版本、时间和浏览器通道。
- [ ] 核对 PR #223 head `6a411499…`、merge `28d5e517…`。
- [ ] 核对 worktree commit 与 dirty 状态；保留用户改动，不 reset/checkout/clean。
- [ ] 确认 PostgreSQL、Web/API origin、文件目录和回调均为本机隔离资源。
- [ ] 记录 Node/pnpm 版本，按 lockfile 检查依赖。
- [ ] 启动专用 PostgreSQL，执行 migration、必要 baseline/bootstrap 和本地账号准备。
- [ ] 启动本地 API/Web，记录端口、进程、日志和 URL。
- [ ] 核对本地 `/health`、`/ready`、`/login`；任一失败立即停止。
- [ ] 确认本地测试租户/园区、岗位账号和测试数据清理方式。
- [ ] 创建 `13-pr223-windows-real-browser-uat`，不改写 2026-08-04 历史证据。

Gate 0：代码可追溯、本地栈完全隔离、站点健康、账号范围明确、Chrome 可连接、无秘密落盘；否则
记录 `BLOCKED`，不得启动矩阵。

## Phase 1 — Chrome/内置浏览器通道

- [ ] 启用 Computer Use 与 Chrome 插件，确认正确 Chrome profile、目标站点授权和活动桌面。
- [ ] Chrome clean login，保存带地址栏/环境上下文的首张证据。
- [ ] 内置浏览器单独登录，仅登记为补充复核通道。
- [ ] 初始化目录、`README.md`、`uat-matrix.csv`、`defects.csv`。
- [ ] 确认文件上传、Chrome 15 项不使用内置浏览器代替。

## Phase 2 — 登录、菜单、角色和会话隔离

- [ ] 各岗位从 clean login 开始，核对 `/users/me` 的角色、租户和园区。
- [ ] 核对民宿/住房 17 个 canonical 菜单和共享控制面菜单的正向可见性。
- [ ] 核对仅民宿、仅住房、双域、只读和无权限角色的菜单/直达 URL 负向。
- [ ] 验证旧重复入口消失、legacy landing 正确、畸形深链 fail closed。
- [ ] 切换账号/模块/权限/data-scope 及 401，验证离线草稿、缓存、通知和敏感数据不串号。

## Phase 3 — 民宿与住房 17 个工作台

- [ ] H-01~H-08：dashboard/tasks/availability/rates/bookings/stays/turnovers/finance。
- [ ] H-09：booking/stay/turnover detail 从可见业务入口进入。
- [ ] H-10：403、空态、错误态、离线恢复、敏感字段和无权动作。
- [ ] R-01~R-09：dashboard/tasks/tenants/leases/handovers/billing/finance/repairs/purchases。
- [ ] R-10：lease/handover/repair/purchase detail 与 Party canonical 跳转。
- [ ] R-11：403/409、空 scope、离线恢复、敏感字段、maker-checker 和无权动作。

## Phase 4 — Party、身份与控制面

- [ ] PARTY-01：Party 筛选、分页、创建入口、403、空 scope、离线重载。
- [ ] PARTY-02：同一详情分别验证 read/update/sensitive/identity 权限组合。
- [ ] ID-01：identity submission 列表/详情/状态/Party 回链和敏感审计字段。
- [ ] ID-02：更新/提交/领取/核验动作权限与负向；默认不提交未获批写操作。
- [ ] CTRL-01：notification 未读/已读、mark-read 权限和重复点击锁。
- [ ] CTRL-02：approval incident retry 原因、expected version、越权和重复点击。
- [ ] CTRL-03：event incident replay 原因、DLQ version conflict、越权和重复点击。
- [ ] CTRL-04：task/approval slots 的 claim/start/block/unblock/release 权限和原因。
- [ ] CTRL-05：permissions tree 管理员正向与非管理员拒绝。

## Phase 5 — PR223 review-fix 定向回归

- [ ] STAY-01：住客登记、凭证必填/发放/回收、无权按钮隐藏。
- [ ] STAY-02：no-show 原因、arrival date 约束和终态后禁用。
- [ ] LEASE-01：pending-signature 签署、合同附件、同住人和终态隐藏。
- [ ] LEASE-02：上传权限、MIME/大小校验和重复提交锁。
- [ ] FIN-01：收款/押金入口、应收目标、正金额/原因校验、void/余额过滤。
- [ ] FIN-02：财务权限和幂等锁；未获明确授权停在最终提交前。
- [ ] FILE-01：attachments/files 上传、下载、预览、删除权限、401 reset 和离线队列。
- [ ] MENU-01：granular permission 下 canonical menu 与 direct URL 一致。

## Phase 6 — 移动、键盘、缩放与可访问性

- [ ] 17 个工作台桌面无空白、runtime error 和布局截断。
- [ ] 390px 覆盖高频任务、Party/身份、控制面和 review-fix 页面，记录移动卡片与触控操作。
- [ ] bookings/repairs 额外执行 320/390/768，无横向溢出。
- [ ] 键盘顺序、焦点、Esc/Enter、错误恢复、对话框关闭后焦点返回。
- [ ] 200%/400% zoom/reflow、screen-reader semantics、reduced-motion、forced-colors。

## Phase 7 — PR223 本地服务上重跑 Chrome 15 项

仅用本机 Chrome，消费历史矩阵但将结果写入新 run：

- [ ] C-01 clean login；C-02 allowlist draft；C-03 refresh/24h。
- [ ] C-04 sensitive-data；C-05 queue fail-closed。
- [ ] C-06/C-07/C-08：320/390/768 overflow。
- [ ] C-09 offline image queue；C-10 recovery stable key；C-11 version/scope。
- [ ] C-12 logout/login；C-13 account/module/permission scope。
- [ ] C-14 keyboard/screen reader；C-15 error/network copy。

Gate C：15/15 都有 PR223 tested commit 与本地栈身份、本机 Chrome 截图、环境元数据和结果；0 项主动跳过。
仍受阻则保留 `BLOCKED`，不用内置浏览器替代，不关闭环境 P1。

## Phase 8 — 缺陷、复验、清理与证据封存

- [ ] P0/P1/P2/P3 分级；每个 FAIL 有角色、URL、步骤、预期/实际、截图、owner、defect ID。
- [ ] 修复后绑定新 commit/本地启动记录重跑受影响 case，旧证据保留。
- [ ] 清理获批创建的 `UAT_PR223_20260810_` 数据并验证 residual=0。
- [ ] 回收临时权限，清除浏览器下载中的敏感副本和不需要的会话数据。
- [ ] 生成最终矩阵、SHA-256 manifest 和总结 README。
- [ ] 核对无 case 缺结果、无 P0/P1、无秘密、无历史证据被覆盖。

## Phase 9 — Trellis 交回

- [ ] notes 登记 PR/commit/本地栈、run 目录、矩阵汇总、缺陷、清理和 reviewer。
- [ ] Chrome 15/15 通过时仅 supersede 环境阻塞，不改写历史 `BLOCKED`。
- [ ] 将浏览器证据交回 `07-30-pr192-human-uat-production-readiness`，注明本次权威对象为 PR223。
- [ ] 分别报告 browser evidence / human sample / named signoff / production readiness。
- [ ] 用户复核本计划前不得执行 `task.py start`。

## 可用诊断与停止条件

可按仓库当前脚本选择 `pnpm db:up`、`pnpm db:migrate`、`pnpm db:seed:prod`、
`pnpm db:check:init`、`pnpm db:bootstrap:admin`、`pnpm dev:api`、`pnpm dev:web`；
执行前核对环境变量，禁止连接线上数据库。`pnpm go-live:uat-browser` 仅作路由诊断，
不能替代真实页面证据；清理只针对已确认的本地数据库和测试前缀。

遇到 commit 身份不明、本地隔离不成立、ready/login 失败、跨租户、敏感泄漏、财务幂等异常、maker-checker
绕过、不可恢复写入、持续 5xx、上传异常或页面/截图身份不明，立即停止并记录
`BLOCKED`/P0/P1，不自行扩大权限或改用替代证据。
