# 修复 Issue 405 非生产 approval runtime UAT 启用入口

## Goal

为住房隔离 UAT 提供一个受支持、fail-closed、可审计的命令入口，仅在显式非生产目标启用 `approval.enforce`，同时保持生产初始化和生产部署默认 disabled、零直操作语义不变。

## Requirements

- 入口必须是独立运维/UAT 命令，不新增生产 UI/API，不接入生产部署、迁移或 seed。
- 实际写入必须同时提供专用 allow-write 标志、非生产 target、隔离 compose 文件、compose project、数据库容器、tenant、park、操作者与 approval reference；任一缺失均在连接数据库前拒绝。
- 对 production-like `NODE_ENV`/`APP_ENV`/target/compose/database/host fail closed；仅接受 disposable/local/test/ci UAT 目标。
- 写入前校验目标 scope、签名 control、disabled 旧状态、contract hash 和 expected version；使用 CAS，禁止覆盖已启用或漂移状态。
- 单事务更新 `sys_property_runtime_control` 并向 `sys_op_log` 写入 before/after、操作者、时间、approval reference、scope 和 request id；命令回读 runtime 与审计行，不输出秘密。
- 提供契约测试，至少覆盖生产拒绝、非生产可启用路径和事务内审计记录。
- 同步 UAT/运维文档与根 package 命令；不得修改 production seed 默认值。

## Acceptance Criteria

- [ ] production-like 环境无论是否给 allow-write 均在执行 SQL 前拒绝。
- [ ] 明确 disposable 非生产环境可对唯一匹配的 `approval.enforce` disabled control 做 CAS 启用。
- [ ] 同事务产生唯一、可回读的 `sys_op_log` 审计记录，包含 before/after、actor、approval reference、tenant/park 与 request id。
- [ ] 缺失/重复 scope、hash/version 漂移、已启用状态或 SQL 未影响恰好一行时整体回滚。
- [ ] 契约测试与相关脚本测试通过，`git diff --check`、lint/typecheck/build 按改动风险通过。
- [ ] Issue #405 有方案论证；PR `Closes #405`，review 不超过三轮，PR CI、merge 后 main CI 与 Deploy Production 双绿。

## Out of scope

- 生产环境直接启用 approval runtime。
- 更改 production-safe seed、迁移或 runtime control manifest 默认 disabled 合同。
- 用该入口直接制造租约、审批或财务业务终态。
