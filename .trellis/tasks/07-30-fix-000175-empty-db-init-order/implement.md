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
- [x] 初版在普通 migration 未成功且执行前运行目标目录前置项。
- [x] 保持旧环境 fast-skip 和普通 migration checksum 语义不变。
- [x] 保持 prerequisite 失败即停，不把目标 migration 标记为 running。

## 3. 前置 SQL

- [x] 将角色 prerequisite 前移到首个依赖角色授权的 `000064`。
- [x] 仅插入七个缺失角色模板。
- [x] 与 production seed 使用相同固定 UUID 和核心元数据。
- [x] 不更新已有角色，不创建权限关系、用户或业务数据。
- [x] 添加 README 说明边界和命名约定。

## 4. 测试

- [x] 添加 runner 静态回归脚本，并实跑隔离状态机行为验证。
- [x] 验证全量已完成库不补跑 prerequisite；部分初始化库会在已成功早期目标处补跑。
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
- production seed：三个生产安全 seed 文件执行成功；七个前置角色各唯一一条。
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

## 9. PR 评审修复

### 9.1 权限差集与回填

- [x] 创建“角色在首次授权前存在”的参考空库和当前顺序候选空库。
- [x] 枚举全部引用 `sys_role` 的关系表，并比较 migration 后差集（504 条，均为权限关系）。
- [x] 两库分别执行 production seed，再比较仍残留的精确差集（458 条）。
- [x] 将生产角色权限差集补入权威 production seed，不授予参考库之外的权限。
- [x] 增加精确关系矩阵回归，覆盖安全、工程等评审指出的遗漏面。
- [x] 验证 production seed 首次和重复执行均幂等。
- [x] 抽样真实安全/工程角色 `/users/me` 有效权限。

### 9.2 双 history 协议

- [x] 将两张 history 表的状态写入改为单事务。
- [x] bootstrap 后比较共享 filename 的 status/checksum 并 fail-fast。
- [x] 保留单边缺行的安全复制，不静默覆盖冲突行。
- [x] prerequisite 和普通 migration 的读取、fast-skip 受同一一致性门禁保护。
- [x] 添加状态分歧、checksum 分歧、单边缺行回归。
- [x] 添加第二张表写入失败时双表整体回滚的故障注入测试。

### 9.3 交付

- [x] 同步 migration/初始化/测试文档。
- [x] 重跑 shell/static tests、Docker 空库、production seed、重复迁移。
- [ ] 确认工作区只包含本任务文件。
- [ ] commit 并 push `fix/000175-empty-db-init-order`。
- [ ] 附验证证据回复并解决 review thread
  `PRRT_kwDOSeY9_c6U_JbC`、`PRRT_kwDOSeY9_c6U_JbG`。

### 9.4 评审修复验证结果

- 参考库（角色在 `000064` 前存在）与原候选库比较：
  - migration 后缺 504 条关系；
  - production seed 后仍缺 458 条；
  - 五张含 `role_id` 的关系表中，差集全部位于 `rel_role_perm`。
- 修复后的全新 PostgreSQL 16 空库：
  - 182 个 migration + 1 个 `000064` prerequisite 全部 succeeded；
  - 两张 history 表各 183 行，failed/running 0，单边/状态/checksum 分歧 0；
  - 与参考库的权限、数据范围、字段权限、字段策略、用户角色五类关系差集 0。
- production seed：
  - 新空库首次和第二次执行成功，权限修复均为幂等 no-op；
  - 原候选库首次修复插入 458 条，后续执行为 no-op；
  - 修复 seed 自带 458 条完整性断言，任一预期关系缺失即回滚失败。
- runner 故障注入：
  - `succeeded/running` 与 checksum 分歧均在 fast-skip 前失败；
  - 单边缺行由 bootstrap 补齐；
  - 第二表拒绝写入时，普通 migration 和 prerequisite 的两表记录均为 0，SQL 产物未创建。
- 部分初始化模拟：`000064` 已 succeeded、后续 migration pending 时，新 prerequisite
  在跳过 `000064` 前成功补跑，再继续后续 migration。
- 真实 API：
  - `zhao_yongwei` `/users/me` 返回 `OPERATIONS_OWNER`、`EXECUTIVE`，包含
    `safety_inspect_point:read`、`ENGINEERING_PROJECT_VIEW`；
  - `yuan_haitao` `/users/me` 返回 `AUDITOR`，包含 `ENGINEERING_PROJECT_VIEW`。
- 质量门：
  - `pnpm test:e2e:migration-prerequisites` 通过；
  - `pnpm lint`、`pnpm typecheck`、`pnpm build` 全部通过；
  - `sh -n scripts/db-migrate.sh`、`git diff --check` 通过。
