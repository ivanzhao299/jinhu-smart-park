# 000175 空库初始化顺序修复实施计划

## 1. 门禁

- [x] 用户授权独立设计与修复。
- [x] 使用独立分支 `fix/000175-empty-db-init-order`。
- [x] 确认不修改历史 `000175`。
- [x] 核对 production seed 的固定角色 ID 与元数据。
- [x] 用户/实施授权已满足后启动 Trellis task。

## 2. Runner

- [x] 增加 `MIGRATION_PREREQUISITES_DIR`，默认指向 `database/migration-prerequisites`。
- [x] 抽取可复用的受 history/checksum 保护 SQL 执行函数。
- [x] 在普通 migration 未成功且执行前运行目标目录前置项。
- [x] 保持旧环境 fast-skip 和普通 migration checksum 语义不变。
- [x] 保持 prerequisite 失败即停，不把目标 migration 标记为 running。

## 3. 前置 SQL

- [x] 新增 `000175.../001_core_role_templates.sql`。
- [x] 仅插入七个缺失角色模板。
- [x] 与 production seed 使用相同固定 UUID 和核心元数据。
- [x] 不更新已有角色，不创建权限关系、用户或业务数据。
- [x] 添加 README 说明边界和命名约定。

## 4. 测试

- [x] 添加 runner 静态回归脚本，并实跑隔离状态机行为验证。
- [x] 验证目标已 succeeded 时不执行 prerequisite。
- [x] 验证 prerequisite checksum drift/running/SQL failure fail-fast。
- [x] Docker 空卷完整迁移成功。
- [x] 两张 history 表一致且无 failed/running。
- [x] production seed 成功。
- [x] 第二次 migration 快速跳过。
- [x] 七个角色唯一且固定 ID 正确。

## 5. 文档

- [x] 更新数据库初始化 Trellis spec。
- [x] 更新生产 migration 策略。
- [x] 更新部署文档。
- [x] 更新测试运行文档。

## 6. 质量门

- [x] `sh -n scripts/db-migrate.sh`
- [x] 目标回归脚本通过。
- [x] `docker compose ... config --quiet`
- [x] `git diff --check`
- [x] Trellis check 通过。

## 8. 验证结果

- 空库 PostgreSQL 16：182 个 migration 全部成功，prerequisite 1 个成功，失败 0。
- `000175` 产物：职责用户 19 个，职责角色关联 31 条。
- 双历史表：空库实跑时各有 183 条 `succeeded`（182 migration + 1 prerequisite）。
- production seed：两个生产安全 seed 文件执行成功；七个前置角色各唯一一条。
- 重复迁移：直接报告 `No new migrations`。
- 老环境模拟：删除两张表中的 prerequisite history 后，保留 `000175=succeeded`，
  再执行 migration 仍快速跳过，未补写 prerequisite history。
- 状态机：succeeded checksum drift、running、prerequisite SQL error 均在目标 migration 前阻断；
  SQL error 仅写 prerequisite=`failed`，目标 migration 无 history、无副作用。
- 历史 `000175` SHA-256 仍为
  `5daaca3cb4a48b40c258446c36427c49ad657bd4d95de388ca9661c3cd52c89c`。

## 7. 回滚点

- runner 改动后先通过隔离行为测试，再执行真实空库。
- 空库迁移失败时立即停止，不执行 seed。
- 不删除或重写 migration history；测试卷清理由明确命名的 Compose project 管理。
