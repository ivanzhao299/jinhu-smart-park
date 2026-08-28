# 园区切换权限调整机制核查

## Goal

在零产品代码改动、零生产直操作前提下，静态追踪园区切换后的授权上下文重建链路，并在隔离环境复现超级管理员与普通用户的三类跨园区场景，形成可审查的根因、定性、候选方案和产品决策门报告。

## Confirmed Context

- 菜单与权限按 `(tenant_id, park_id)` 解析，`rel_user_role` / `rel_role_perm` 为园区维度链接。
- 既有 G6 只覆盖双园区都有角色的用户；未覆盖目标园区仅有 access、以及 bootstrap/super admin 切换。
- 创建园区事务只对创建者自动追加目标园区 access 与 tenant-admin 关系。
- 已批准本轮完成调查、报告、PR、review、CI、merge 与 main 双绿；不得创建修复 Issue。

## Requirements

1. 从 `POST /auth/switch-context` 静态追踪 token/claims/park 注入、`GET /users/me`、菜单树、super/wildcard、路由与 API 守卫链，并留存准确 `file:line`。
2. 核查 bootstrap admin wildcard/super 关系究竟是租户级能力还是依赖园区级角色链接，以及初始园区之外实际存在何种关系。
3. 核查用户管理“配置园区”入口实际写表与事务边界，确认是否只写 `rel_user_park`、是否同步任何角色或权限关系。
4. 在独占隔离 compose 与专用 Chrome profile 中执行 S1/S2/S3；不得接触生产、主 Chrome、他人容器或 HR 系列。
5. 每场景保留浏览器断言、截图、完整 Network、manifest，以及 `rel_user_park` / `rel_user_role` / `rel_role_perm` 双园区 DB 计数；遵守既有产品 API fixture、raw CDP、R5 园区与 16 表冻结规则。
6. 对 S1/S2 分别定性；每项给出 1–3 个方案、推荐、改动面、风险、迁移、验证，并显式列出产品决策门。
7. 产出 `docs/reviews/park-switch-permission-investigation-2026-08-28.md`，且只允许报告与 Trellis 调查任务工件发生仓库改动。
8. 报告分支提交并创建 PR，完成一轮 review、CI、merge，确认 main 双绿；不 force push，不从本轮创建修复队列或 Issue。

## Acceptance Criteria

- [ ] 报告逐层回答权限在园区切换后如何调整，并有可点验的源码行号。
- [ ] S1 覆盖 bootstrap/super admin 切换到自己创建与他人创建园区（环境不可行时如实记录阻断与替代证据）。
- [ ] S2 复现 A 有角色、B 仅 access 无角色；S3 快速复核双园区都有角色的正常对照。
- [ ] 三场景均具备浏览器、Network、截图/manifest 与 DB 证据，不伪造、不记录敏感信息。
- [ ] S1/S2/S3 有明确结果与定性；推荐方案与用户/产品决策点分离。
- [ ] `git diff` 证明零产品代码改动、未触碰 HR 文件；相关报告校验通过。
- [ ] PR 经一轮 review、CI 后合并，main 分支检查双绿，Trellis 任务完成收尾。

## Out of Scope

- 任何 API、Web、shared、migration、seed、测试产品代码修复。
- 生产数据库、生产容器或生产授权数据操作。
- 创建修复 Issue、修复任务或直接实施任一候选方案。

## Product Decision Gates (report-only)

- super/wildcard 是否应跨同租户所有园区生效。
- 授予园区 access 时是否要求显式角色、默认角色、复制/继承角色，或仅增加引导。
- 切换到无业务权限园区时应拒绝切换、允许进入空态，还是自动回退。
