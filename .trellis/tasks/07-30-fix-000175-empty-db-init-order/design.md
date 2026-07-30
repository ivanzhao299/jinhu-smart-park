# 000175 空库初始化顺序修复设计

## 1. 结论

在 `scripts/db-migrate.sh` 增加目标迁移前置项（migration prerequisite）机制：

```text
000063 succeeded
  ↓
发现整个批次仍有 pending migration
  ↓
执行 database/migration-prerequisites/
  000064_s3e_checkout_effective/
  001_core_role_templates.sql
  ↓ 独立 history + checksum + fail-fast
执行 000064 及后续历史授权
  ↓
执行原始 000175（文件与 checksum 不变）
  ↓
正式 production seed
```

这是对历史迁移依赖缺口的向前兼容修复，不是对 `000175` 的内容修订。

## 2. 目录与身份

前置 SQL 放在：

```text
database/migration-prerequisites/
  000064_s3e_checkout_effective/
    001_core_role_templates.sql
```

目标 migration filename 是目录名。历史身份使用：

```text
prerequisite:000064_s3e_checkout_effective.sql:
001_core_role_templates.sql
```

历史记录继续写入：

- `public.sys_schema_migration_history`
- `public.schema_migrations`

不把前置文件加入普通 migration manifest；普通 migration 的 filename/checksum 语义保持不变。

## 3. 执行规则

runner 处理每个普通 migration 时：

1. 先读取目标 migration 的 history。
2. 如果 manifest 全部成功，fast-skip 直接退出，不补跑前置项。
3. 如果批次仍有 pending migration，逐个 migration 先按文件名顺序读取对应前置目录中的
   `*.sql`；即使该目标已 succeeded，也先执行新补的 prerequisite，再跳过目标。
4. 每个前置项使用独立 history identity 和自身 SHA-256：
   - succeeded + checksum 相同：跳过；
   - succeeded + checksum 不同：失败；
   - running：失败并要求人工检查；
   - failed + checksum 相同或不同：允许显式重试，保留现有 runner 语义；
   - 新项：running → 执行 → succeeded/failed。
5. 任一前置项失败，目标 migration 不进入 running，不执行 SQL。
6. 全部前置项成功后，按原逻辑执行目标 migration。

fast-skip 仍只以普通 migration manifest 为准。全部 migration 已成功的旧环境会整体快速退出，
不会因为新加入的前置目录而被迫补跑；停在 `000175` 前的部分初始化库会在遍历 `000064`
时获得角色，再继续后续 pending migration。

## 4. 最小角色数据

`001_core_role_templates.sql` 在 `000064` 前只插入七个缺失角色，使用 production seed 中相同的固定 UUID、
code、name、role type/scope/data scope、sort、启用状态和 remark：

- `SYSTEM_ADMIN`
- `AUDITOR`
- `OPERATIONS_OWNER`
- `EXECUTIVE`
- `INVEST_MANAGER`
- `FINANCE_MANAGER`
- `FINANCE_SPECIALIST`

插入使用 tenant-wide active role 唯一键语义和 `WHERE NOT EXISTS`。已有角色保持原 ID 和字段，
后续 production seed 负责统一完整基线及权限/数据范围关系。

## 5. 安全边界

- 不创建登录账号或密码。
- 不授予任何权限、模块或数据范围关系。
- 不覆盖已有角色。
- 不修改成功 migration checksum。
- 不允许 prerequisite 绕过普通 migration 的失败。
- prerequisite 只在 manifest 仍有 pending migration 的批次中生效；全量完成库 fast-skip。

## 6. 验证矩阵

### 空库

1. 新 PostgreSQL volume。
2. `pnpm db:migrate` 全量成功。
3. 查询两张 history 表无 failed/running 或 status/checksum 分歧。
4. 验证 `000064` prerequisite 记录 succeeded，`000175` 及最新 migration succeeded。
5. 验证七个角色唯一且固定 ID 正确。
6. production seed 成功。
7. 第二次 migration 快速跳过。

### 已部署库兼容

构造一个 history 已记录全部 migration succeeded 的库，确认 runner fast-skip 且不补记
prerequisite；再构造停在 `000175` 前的库，确认 runner 在遍历已成功 `000064` 时补跑
prerequisite，随后正式 production seed 修复历史遗漏授权。

### 失败语义

用隔离的临时 prerequisite 目录验证 SQL 错误、running、checksum drift 都在目标 migration 前阻断。

## 7. 文档与发布

同步：

- `.trellis/spec/config/backend/database-initialization.md`
- `docs/release/production-migration-execution-policy.md`
- `docs/deployment/production.md`
- `docs/testing/how-to-run-tests.md`
- `database/migration-prerequisites/README.md`

release order 不改变。

## 8. 回滚

代码回滚删除 runner 的 prerequisite 支持和新目录即可。已经成功执行的 prerequisite history
记录保留审计，不物理删除；七个角色随后也会由 production seed 管理，不应自动删除。

## 9. PR 评审后的补充设计

### 9.1 更早授权静默丢失

评审指出，`000175` 前已有 migration 通过 `JOIN sys_role` 给这些角色授权。角色不存在时，
SQL 不报错，而是插入 0 行。因此“migration、seed 均成功”和“七个角色存在”不足以证明
最终权限基线正确。

不采用“把 prerequisite 简单移动到更早 migration”作为唯一修复：

- 它只能修复全新空库；
- 对已经执行过早期 migration、但停在 `000175` 前后的环境，早期 prerequisite 不会再运行；
- 不能证明当前 production seed 后还缺哪些关系。

采用以下可审计流程：

1. 建立参考空库：在首次依赖这些角色的授权 migration 前创建同一组角色，再执行完整
   migration 和 production seed。
2. 建立候选空库：按 PR #195 当前正式顺序执行完整 migration 和 production seed。
3. 按角色 code 和关联对象自然键比较所有引用 `sys_role` 的关系表，生成精确差集。
4. 将仍缺失的 458 条既定角色权限关系放入
   `database/seeds/production/000004_core_role_permission_repair.sql` 幂等维护。
5. 回填只插入参考库已存在的关系，不增加超出参考基线的权限，不覆盖租户自定义关系。

production seed 是正式初始化顺序中 migration 后的基线收敛步骤，也可由运维显式重跑，
因此适合修复此前静默跳过的生产角色权限。发布说明需明确：受影响的既有环境需要重跑
修订后的 production seed；不得只部署 runner 后跳过基线收敛。

### 9.2 双 history 原子性与一致性

runner 的 history 协议改为：

1. bootstrap 只对单边缺失的 filename 复制完整行；共享 filename 不覆盖。
2. bootstrap 后立即比较两表共享 filename 的 checksum、status 和必要执行元数据。
3. 任一共享行不一致立即失败，并报告 filename 与差异；禁止进入 fast-skip。
4. 每次 `running`、`succeeded`、`failed` 写入使用同一条 `psql` 会话中的单个事务，
   在事务内 upsert 两张表；任一表写失败则两表都不提交。
5. prerequisite 与普通 migration 使用同一 history 写入和一致性读取协议。
6. fast-skip 只能在全表一致性检查通过后使用。

不自动修复已有冲突行，因为 runner 无法安全判断哪一侧代表真实执行结果。冲突需要运维
核对执行日志和数据库产物后人工处理。

### 9.3 验证矩阵

权限完整性：

- 对照库/候选库在 migration 后、production seed 后各比较一次角色关系。
- 枚举所有外键指向 `sys_role` 或包含 `role_id` 的关系表，避免只检查
  `rel_role_perm`。
- 对残余差集逐项说明其来源 migration、关联对象和修复归属。
- 验证 production seed 重复执行无新增重复关系。
- 使用代表性安全/工程角色调用 `/users/me`，确认有效权限与菜单能力。

history 故障注入：

- 主表 `succeeded`、兼容表 `running`，必须 fail-fast。
- 主表 `failed`、兼容表 `succeeded`，必须 fail-fast。
- 同 filename checksum 不同，必须 fail-fast。
- 单边缺行由 bootstrap 补齐，随后一致性检查通过。
- 在第二张表安装拒绝特定 fixture filename 的触发器，验证双写整体回滚。
- 对普通 migration 和 prerequisite 各执行一次原子回滚验证。

### 9.4 完成条件

只有权限差集归零、双 history 故障注入通过、真实角色抽样通过后，才回复并解决两个
GitHub review thread。提交说明和线程回复必须附验证命令及关键结果。
