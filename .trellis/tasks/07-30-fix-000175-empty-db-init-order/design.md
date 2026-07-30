# 000175 空库初始化顺序修复设计

## 1. 结论

在 `scripts/db-migrate.sh` 增加目标迁移前置项（migration prerequisite）机制：

```text
000174 succeeded
  ↓
发现 000175 尚未 succeeded
  ↓
执行 database/migration-prerequisites/
  000175_2026_responsibility_user_role_queue/
  001_core_role_templates.sql
  ↓ 独立 history + checksum + fail-fast
执行原始 000175（文件与 checksum 不变）
  ↓
继续 000176+
  ↓
正式 production seed
```

这是对历史迁移依赖缺口的向前兼容修复，不是对 `000175` 的内容修订。

## 2. 目录与身份

前置 SQL 放在：

```text
database/migration-prerequisites/
  000175_2026_responsibility_user_role_queue/
    001_core_role_templates.sql
```

目标 migration filename 是目录名。历史身份使用：

```text
prerequisite:000175_2026_responsibility_user_role_queue.sql:
001_core_role_templates.sql
```

历史记录继续写入：

- `public.sys_schema_migration_history`
- `public.schema_migrations`

不把前置文件加入普通 migration manifest；普通 migration 的 filename/checksum 语义保持不变。

## 3. 执行规则

runner 处理每个普通 migration 时：

1. 先读取目标 migration 的 history。
2. 如果目标 migration 已 `succeeded` 且 checksum 相同，直接跳过；不检查也不执行前置项。
3. 如果目标 migration 需要执行，按文件名顺序读取对应前置目录中的 `*.sql`。
4. 每个前置项使用独立 history identity 和自身 SHA-256：
   - succeeded + checksum 相同：跳过；
   - succeeded + checksum 不同：失败；
   - running：失败并要求人工检查；
   - failed + checksum 相同或不同：允许显式重试，保留现有 runner 语义；
   - 新项：running → 执行 → succeeded/failed。
5. 任一前置项失败，目标 migration 不进入 running，不执行 SQL。
6. 全部前置项成功后，按原逻辑执行目标 migration。

fast-skip 仍只以普通 migration manifest 为准。目标 `000175` 已成功的旧环境会整体快速退出，
不会因为新加入的前置目录而被迫补跑。

## 4. 最小角色数据

`001_core_role_templates.sql` 只插入七个缺失角色，使用 production seed 中相同的固定 UUID、
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
- prerequisite 只在目标 migration 未成功时生效。

## 6. 验证矩阵

### 空库

1. 新 PostgreSQL volume。
2. `pnpm db:migrate` 全量成功。
3. 查询两张 history 表无 failed/running。
4. 验证 prerequisite 记录 succeeded，`000175` 及最新 migration succeeded。
5. 验证七个角色唯一且固定 ID 正确。
6. production seed 成功。
7. 第二次 migration 快速跳过。

### 已部署库兼容

构造一个 history 已记录 `000175 succeeded` 的库，确认 runner 不执行 prerequisite，
不会要求旧环境补记前置项。

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
