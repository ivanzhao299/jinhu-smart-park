# 民宿全流程 UAT 执行设计

## Authority And Boundaries

`docs/testing/windows-chrome-cdp-uat.md` 是方法权威。本轮是只读审计加隔离环境验收；允许写入的仓库文件仅为本任务 Trellis 工件和最终 UAT 报告，产品代码保持零改动。

## Phase Gates

1. 闭环审计：先审共享房源三层硬依赖，再审民宿状态机、RBAC、API/Web、数据与校验闭环。
2. 设计依据与矩阵：把闭合链路转成角色×流程链×Case；gap 链不执行浏览器用例。
3. 隔离执行：唯一 RUN_ID 贯穿资源和 fixture；初始化与三门禁通过后使用专用 Windows Chrome CDP。
4. 证据关闭：UI 登出、逐表 residual=0、文件和 compose 清理、报告、PR/审查/CI/Deploy 与本地收尾。

## Evidence Model

- 权威事实优先级：当前代码/迁移/seed/数据库 schema > 当前设计文档 > 历史 UAT 结论。
- UI URL、DOM、交互反馈是 Case 主断言；API/DB 只读查询只作持久化辅证。
- local-only artifacts 以 Case/步骤命名，包含截图与原始 evaluate/console/network 摘要；入库报告仅索引，不嵌入秘密。
- 每个 gap 记录设计出处、期望、当前实现和受阻链路；每个 FAIL 记录已做的环境排除与疑似根因。

## Isolation And Cleanup

- RUN_ID 格式使用当日本地时间唯一后缀；compose project 为 `jinhu-homestay-uat-<RUN_ID>`。
- 端口用 `ss` 实测，避免历史 55432-55434；如固定 container_name 冲突则阻断或采用仓库已有、经审阅的隔离 compose，不删除他人资源。
- bootstrap 秘密只写 chmod 0600 的 `/tmp` env，通过环境注入，绝不进入命令参数、报告、截图或 Git。
- residual 清单在 Case 设计前由 schema/触达链推导，覆盖 homestay 核心表、审批/outbox/幂等副作用、property/asset 授权、users/roles/tenants/parks 与物理文件。
- 清理严格核对 PID fd、compose label、相同 `-p/-f/--env-file` 与精确文件根。

## Release Shape

从当前基线创建唯一 UAT 分支；报告与 Trellis 工件经 GitHub PR、`@codex review`、CI 后 squash merge。UAT 结论、任务归档状态、Deploy 状态三者分开记录。若发现 FAIL/BLOCKED，仍可提交事实报告，但任务不归档为完成。
