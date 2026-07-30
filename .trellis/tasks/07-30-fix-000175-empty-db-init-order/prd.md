# 修复 000175 空库初始化顺序

## Goal

在不修改已应用 000175 历史迁移的前提下，修复全新空库标准迁移流程被职责角色前置条件阻断的问题。

## Confirmed Facts

- 空 PostgreSQL 16 数据库按 `pnpm db:migrate` 执行时，`000001`～`000174` 成功，
  `000175_2026_responsibility_user_role_queue.sql` 因缺少 `AUDITOR`、`EXECUTIVE`、
  `FINANCE_MANAGER`、`FINANCE_SPECIALIST`、`INVEST_MANAGER`、`OPERATIONS_OWNER`、
  `SYSTEM_ADMIN` 七个角色而失败。
- 七个角色当前由 `database/seeds/000001_s1_production_core.sql` 创建，但正式顺序要求
  migration 全部成功后才允许执行 production seed。
- `000175` 已进入主分支并可能在 UAT/其他环境成功执行；直接修改会触发同名 migration
  checksum 冲突，违反历史迁移不可变规则。
- 生产 seed 还负责租户、权限、数据范围、字段策略、模块等大量基线，不能在迁移中整体偷跑。
- 当前 migration runner 已维护双历史表、checksum、失败状态和失败即停语义。

## Requirements

- 不修改、重命名或复制 `000175_2026_responsibility_user_role_queue.sql`。
- 不接受旧 checksum 白名单，不削弱成功 migration 内容变更的阻断规则。
- 不改变正式顺序：migration → production seed → baseline check → bootstrap admin。
- 在目标 migration 尚未成功且即将执行前，允许执行受版本管理的最小前置 SQL。
- 前置 SQL 只能创建 `000175` 必需且缺失的七个生产安全角色模板，不创建用户、密码、
  demo 数据、模块授权或业务数据。
- 前置 SQL 必须幂等，不覆盖已存在角色，不改变现有角色权限或数据范围关系。
- 前置执行必须有独立 filename、checksum、running/succeeded/failed 历史，并同步到两张历史表。
- 前置 SQL 失败、处于 running、或成功后 checksum 改变时，必须在目标 migration 前立即停止。
- 若目标 `000175` 已成功，旧环境不得被要求补跑此前置项，也不得产生 checksum 冲突。
- 同步 CI/release smoke、迁移策略、数据库初始化规范和测试文档。

## Acceptance Criteria

- [x] 全新空库 `pnpm db:migrate` 从 `000001` 执行至仓库最新 migration 全部成功。
- [x] `000175` 执行前七个缺失角色存在，且 ID/核心元数据与 production seed 契约一致。
- [x] 随后的 `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod` 成功且不产生重复角色。
- [x] 第二次 `pnpm db:migrate` 快速跳过，migration 与 prerequisite 均无重复副作用。
- [x] 已记录旧 checksum 且 `000175` 成功的模拟升级库不执行前置 SQL，正常快速跳过。
- [x] prerequisite checksum 变更、failed/running 状态和 SQL 失败均保持 fail-fast。
- [x] 两张历史表对前置执行结果一致，且没有 failed/running 残留。
- [x] release-smoke 覆盖空库前置项、完整迁移和 production seed 顺序。
- [x] 不修改历史 migration，不降低既有 migration checksum/history 安全性。
- [x] 相关 shell/static tests、Compose 配置、空库实跑和文档校验通过。

## Out of Scope

- 不重构整个 SQL migration 框架或引入 Flyway/Liquibase。
- 不调整 `000175` 的职责用户、组织、岗位和角色分配内容。
- 不把所有 production seed 元数据迁移到 migration。
- 不处理仓库既有重复 `000136` 编号。
- 不修改 PR192 菜单接入分支。

## Approval

- 用户已授权单独设计并修复该缺陷。
