# PSW UAT 复测技术设计

## Authority and boundaries

- 产品基线：`origin/main@eee58bb38575e599b87ed1debe039bd3b32f8c77`。
- 产品语义 authority：PSW-001/002/003 已合入代码与测试、`.trellis/spec/api/backend/park-role-integrity.md`、园区切换调查报告。
- UAT 方法 authority：`docs/testing/windows-chrome-cdp-uat.md`。
- G1–G7 authority：`docs/uat/pam-audit-s15-regression-uat-20260828-122122.md`，其中历史 G6 降为背景材料，本轮 S3/G6 是新的权威状态。
- 本轮原则上只提交文档与 Trellis 工件；所有造数/浏览器 runner 放在本轮 local-only evidence root，除非执行中证明有必要沉淀通用测试脚本。

## Isolated topology

```text
dedicated Windows Chrome profile + raw CDP
                    |
              loopback Web
                    |
          loopback-only API container
                    |
       project-owned PostgreSQL volume
```

- `RUN_ID` 同时限定 compose project、端口、fixture prefix、evidence root、Chrome profile 和报告名。
- 使用专用 compose 文件，避免仓库 dev compose 的固定 container name；PostgreSQL 与 API 均属于本轮 project，Web 是具 PID/日志归属证明的本轮宿主进程。
- env 权限 `0600`，秘密只从 env/stdin 注入；accepted JSON 不保存 fixture 密码或 token。
- 初始化顺序：migrate → production seed → baseline（仅允许 bootstrap 缺口）→ bootstrap admin → strict baseline。

## Fixture and flow model

- Park A：production-safe seed 基线园区。
- Park B：本轮创建且唯一的 S2/S3/G6 目标 Park ID；结果 manifest 作为所有后续 runner 的唯一输入。
- Park C：由第二授权主体通过产品 API 创建，用于 S1b。
- Super：bootstrap 受保护 `SUPER_ADMIN`。
- Creator：具建园能力的普通管理主体，用于创建 Park C；不得尝试把受保护系统角色经普通 target-park API 分配。
- AccessOnly：A 有普通业务角色，B 只有 access，后续显式为 B 配普通角色。
- DualRole：A/B 均有普通角色，且角色/模块能力有可观察差异。

### Product API contracts

- 创建园区：`POST /parks`。
- 创建普通角色及权限：`POST /roles`、`POST /roles/:id/permissions`。
- 创建/更新用户与 access：`POST /users` / `PATCH /users/:id` + `accessibleParkIds`。
- 显式目标园区配角：`POST /users/:id/park-roles` body `{ parkId, roleIds }`。
- 切换：`POST /auth/switch-context`，随后以新 token 读取 `/users/me`。
- super 激活审计：`GET /audit/op-logs?...action=tenant_super_context_activated`。

## Evidence contracts

- `fixture-results.json` 是唯一 ID authority，至少保存 source Park A、target Park B、other-created Park C、用户/角色/资产非敏感 ID；不保存密码/token。
- 每个 runner 从该 manifest 读取目标 Park B，禁止自行发现或硬编码另一个 B。
- S3 强制断言 `fixture.targetParkB === setup.targetParkB === building.parkId === browser.targetParkB`。
- 浏览器 Case 保存 URL/DOM/viewport/console/network 结果与截图；API/DB 只作辅助证据。
- D5 保存列名/计数/非敏感 fixture 标识，验证前后差异，不保存真实用户数据。
- 最终生成 SHA256 manifest，并对文本、JSON、截图/OCR 可检索内容做敏感信息检查。

## G1–G7 mapping

- G1：permission→menu quadrants，执行当前 API property-menu contract 与 Web menu gate。
- G2：module legal/disabled/window combinations，执行当前 module dependency tests，并复核 S3 目标模块投影。
- G3：metadata drift/orphan fail-closed，执行 property-menu malformed-tree contract。
- G4：legacy/canonical landing，执行 Web menu/auth-routing contracts。
- G5：授权刷新，执行 auth/session contracts；S2 配角前后真实 logout/relogin 或 refresh 收敛作为动态补证。
- G6：本轮 S3 单一目标 Park B 的真实 Chrome+API+数据隔离证据，完全替代历史双 ID 权威结论。
- G7：unmodified property API/security gates 与 targeted maker-checker/file/scope tests；只在同一隔离 lifecycle 按已知安全顺序执行。

## Failure, retries, and rollback

- 环境/fixture 问题与产品 FAIL 分类记录；同一场景至多两次。
- UAT 期间不顺手修产品代码。产品 FAIL 则保留任务 in_progress、报告 FAIL 并创建/关联 Issue（若用户给定流程要求）。
- 已知 G2/G7 状态顺序冲突通过固定执行顺序避免：权限/模块/园区矩阵先执行，恢复基线后再执行 G7 gate。
- 清理只使用精确 project label、PID/日志 fd、专用 profile 路径和经过校验的本轮文件根；身份校验失败即停止，不猜测清理目标。

## Report and integration

- 新报告：`docs/uat/psw-uat-retest-uat-<RUN_ID>.md`。
- 同步更新调查报告 S1–S3 与 §15 G6；明确旧 ID 漂移为历史事实、新报告为当前 authority。
- 全 PASS 后在同一报告 PR 中归档 PSW 三子任务、UAT 子任务和队列父任务，保证 main 上的最终状态闭合。
- PR 最多三轮 review，CI 绿后 squash merge；记录 main CI/Deploy 与 production cleanup 结果。
