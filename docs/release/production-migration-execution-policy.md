# JinHu Smart Park 生产 Migration 执行策略与风险接受说明

## 1. 目的

本文件用于规范当前 SQL-first migration 机制下的生产上线执行、记录、失败处理和风险接受口径。

当前 migration runner 已具备 execution history、checksum、失败状态追踪、首次 baseline 和无新增迁移快速跳过能力。本文件保留为生产执行 SOP 与风险边界说明，不替代数据库备份、发布冻结和人工复核。

## 2. 当前机制说明

- 当前 migration 由 `scripts/db-migrate.sh` 执行。
- 当前 migration 以 `database/migrations` 目录下的 SQL 文件为输入。
- 当前执行方式为按文件名顺序执行未成功记录过的 SQL 文件。
- 当前使用 `public.sys_schema_migration_history` 作为兼容主记录表，同时维护标准命名表 `public.schema_migrations`。
- 每个 migration 成功后记录 `filename`、`checksum`、`status`、开始/结束时间、执行人和批次。
- 部署前会先生成 migration manifest；如果 manifest 中所有文件都已按相同 checksum 记录为 `succeeded`，脚本直接退出，不再逐个陪跑。
- 如果目标库已有业务表但 migration history 为空，脚本会自动 baseline：把当前仓库所有 migration 文件标记为已成功，不执行旧 SQL，以保护已有生产数据。
- 如果目标库为空，脚本不会 baseline，会从第一条 migration 正常初始化。
- 当前没有自动 down migration 机制。
- 当前生产发布采用 **forward-only** 策略。
- `production seed` 与 `migration` 是不同职责：
  - migration 负责 schema 和必要结构演进。
  - production seed 负责首发 baseline metadata 初始化。

当前治理状态：

- `scripts/db-migrate.sh` 已引入 `sys_schema_migration_history` 与 `schema_migrations` 记录表。
- 成功执行的 migration 会跳过；无新增 migration 时会整体快速跳过。
- `checksum` 不一致会阻断继续执行。
- `failed` 状态允许在人工确认后修正并重试。
- 非空生产库首次接入 history 机制时会自动 baseline，避免历史 migration 和 seed migration 重复执行。
- 生产发布仍然保持 forward-only，回滚仍以数据库备份为主。

## 3. 已知风险

当前已知风险如下：

- migration 编号重复风险。
- 已执行文件可以通过 `schema_migrations` 或 `sys_schema_migration_history` 查询确认。
- 文件内容事后修改会通过 checksum 不一致自动阻断。
- 半执行失败后需要人工判断数据库状态。
- 重复执行是否安全依赖 SQL 自身幂等性。
- 回滚主要依赖数据库备份恢复。
- seed 和 migration 边界存在混淆风险。

当前仓库已观察到的重复编号现象：

- `000136_idempotency_request.sql`
- `000136_s9f_energy_billing_allocation.sql`

补充说明：

- `scripts/db-migrate.sh` 会把 running / succeeded / failed 状态写入 migration 记录表。
- 一旦某个 SQL 执行失败，脚本会写入 failed 状态和错误摘要，并停止后续迁移；后续仍需要人工核查数据库现场后再重试。

## 4. 风险接受口径

- 当前机制可以支撑**首发单次受控发布**。
- 当前机制**不适合作为长期多环境、多人员、多批次发布机制**。
- 上线前必须执行数据库备份。
- 执行 migration 时必须保留命令日志。
- 一旦失败，必须停止后续步骤，不允许继续盲跑。
- 生产发布前必须由发布负责人和数据库负责人共同确认风险接受。

风险接受边界：

- 可接受：单次受控发布、发布窗口固定、责任人明确、备份与日志齐全。
- 不可接受：发布窗口内继续改 migration、无备份执行、失败后人工拼接继续跑、多人各自判断数据库状态。

## 5. 生产执行前置条件

执行生产 migration 前必须同时满足以下条件：

- `release-smoke` 已通过。
- Final Go 已完成。
- 当前发布 commit 已冻结。
- migration 文件清单已冻结。
- 数据库备份已完成。
- 文件备份已完成。
- production seed 策略已确认。
- bootstrap-admin 策略已确认。
- 执行人和复核人已确认。
- 回滚策略已确认。

如任一条件未满足，直接判定为 No-Go。

### 5.1 与 migration history/checksum 设计的衔接

本文件负责的是当前 SQL-first 机制下的生产执行强缓解口径，`migration-history-checksum-design.md` 负责记录 history + checksum 的最小实现设计和后续治理路径。

两份文档的关系建议按以下顺序理解：

1. 先用本文件冻结生产执行口径，确保当前发布可受控、可备份、可停止。
2. 再用 `migration-history-checksum-design.md` 明确中期实现目标，避免实现阶段再重新争论状态语义、跳过规则和失败恢复。
3. 最后在实现阶段把 history/checksum 落到脚本和数据库表，而不是先改脚本再补文档。

当前状态下，这一最小机制已经落地，后续重点转为治理收口和长期机制演进。

换句话说：

- 本文件解决“现在怎么安全发”。
- `migration-history-checksum-design.md` 解决“下一步怎么把机制做出来”。

如果后续直接进入实现，建议严格按以下顺序推进：

1. 先冻结本文件中的风险接受、备份、清单和 Go / No-Go 口径。
2. 再落地 `migration-history-checksum-design.md` 里定义的 history 表和状态语义。
3. 然后修改 `scripts/db-migrate.sh`，让脚本先具备记录、跳过和阻断能力。
4. 最后补充验证与上线后文档收口，避免脚本能力和发布口径再次脱节。

## 6. Migration 文件清单冻结

发布前必须生成“本次 migration 文件清单”，并由发布负责人和数据库负责人共同确认。

冻结要求：

- 发布前列出本次参与执行的 migration 文件清单。
- 记录文件名。
- 记录排序。
- 记录是否历史文件。
- 记录是否本次新增。
- 禁止发布窗口内继续修改 migration 文件。
- 禁止新增重复编号 migration。
- 禁止修改已经执行过的 migration 文件。

建议表格：

| 顺序 | 文件名 | 类型：历史 / 本次新增 | 是否确认 | 备注 |
|---|---|---|---|---|
| 1 | `<待填写>` | `<待填写>` | `<待填写>` | `<待填写>` |
| 2 | `<待填写>` | `<待填写>` | `<待填写>` | `<待填写>` |
| 3 | `<待填写>` | `<待填写>` | `<待填写>` | `<待填写>` |

建议填写口径：

- “历史”表示本次并非新增文件，但仍会参与顺序执行判断或发布核查。
- “本次新增”表示本次版本新增、且预期在目标环境首次执行的 migration 文件。

## 7. 执行前备份要求

执行前必须完成以下备份要求：

- PostgreSQL 备份。
- 明确备份文件命名规则。
- 明确备份存放位置。
- 明确备份校验方式。
- 明确备份负责人。
- 明确恢复负责人。
- 完成备份签字确认。

强约束：

- 没有数据库备份，不允许执行 migration。
- migration 回滚优先依赖数据库备份恢复。

建议模板：

### 7.1 PostgreSQL 备份

- 备份方式：`pg_dump` 或运维标准数据库备份方式
- 备份文件命名规则：`jinhu_pg_<env>_<commit>_<YYYYMMDD_HHMM>.dump`
- 备份存放位置：`<待填写>`
- 备份校验方式：
  - 检查文件存在
  - 检查文件大小合理
  - 抽样校验可恢复性或可读取性

### 7.2 备份责任人

| 角色 | 姓名 | 是否确认 | 时间 | 备注 |
|---|---|---|---|---|
| 备份负责人 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 恢复负责人 | `<待填写>` | `<待填写>` | `<待填写>` |  |

### 7.3 备份完成签字

| 项目 | 结论 | 签字人 | 时间 | 备注 |
|---|---|---|---|---|
| PostgreSQL 备份已完成 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 文件备份已完成 | `<待填写>` | `<待填写>` | `<待填写>` |  |

## 8. 执行命令模板

以下命令模板不包含真实密码或真实密钥。

### 8.1 检查 compose 配置

```bash
docker compose -f infra/docker/docker-compose.prod.yml config
```

### 8.2 启动 PostgreSQL

```bash
docker compose -f infra/docker/docker-compose.prod.yml up -d postgres
```

### 8.3 执行 migration

```bash
COMPOSE_FILE=infra/docker/docker-compose.prod.yml \
POSTGRES_DB=<POSTGRES_DB> \
POSTGRES_USER=<POSTGRES_USER> \
POSTGRES_PASSWORD=<POSTGRES_PASSWORD> \
pnpm db:migrate
```

### 8.4 执行 production seed

```bash
COMPOSE_FILE=infra/docker/docker-compose.prod.yml \
POSTGRES_DB=<POSTGRES_DB> \
POSTGRES_USER=<POSTGRES_USER> \
POSTGRES_PASSWORD=<POSTGRES_PASSWORD> \
ALLOW_PRODUCTION_SEED=yes \
pnpm db:seed:prod
```

### 8.5 执行基线检查

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
pnpm db:check:init
```

### 8.6 执行 bootstrap-admin

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
ADMIN_USERNAME=<ADMIN_USERNAME> \
ADMIN_PASSWORD='<STRONG_PASSWORD>' \
ADMIN_NAME='<ADMIN_NAME>' \
ADMIN_EMAIL='<ADMIN_EMAIL>' \
ADMIN_PHONE='<ADMIN_PHONE>' \
ROLE_CODE=SUPER_ADMIN \
pnpm db:bootstrap:admin
```

### 8.7 再次执行基线检查

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
pnpm db:check:init
```

说明：

- production seed 不等于 migration。
- migration 失败后不要继续执行 seed。
- `check-init-baseline` 仅用于 release baseline 检查，不替代 migration history。

## 9. 执行日志记录

执行 migration 时必须记录并归档执行日志。

至少记录以下信息：

- 执行时间
- 执行人
- 数据库名
- commit
- migration 文件数量
- 最后一个开始执行文件
- 最后一个成功文件
- 失败文件
- 错误摘要
- 后续处理结论

建议表格：

| 项目 | 记录值 | 备注 |
|---|---|---|
| 执行时间 | `<待填写>` |  |
| 执行人 | `<待填写>` |  |
| 数据库名 | `<待填写>` |  |
| commit | `<待填写>` |  |
| migration 文件数量 | `<待填写>` |  |
| 最后一个开始执行文件 | `<待填写>` |  |
| 最后一个成功文件 | `<待填写>` |  |
| 失败文件 | `<待填写>` | 无失败则填 `无` |
| 错误摘要 | `<待填写>` | 无错误则填 `无` |
| 后续处理结论 | `<待填写>` | 继续 / 回滚 / 放弃发布 |

建议日志归档位置：

- `<待填写>`，例如发布工单附件、运维共享目录、CI artifact 或值守记录目录。

## 10. 失败处理策略

必须明确以下规则：

- 任一 migration 失败，立即停止发布。
- 不继续执行 production seed。
- 不继续启动 API / Web。
- 保留容器和数据库现场。
- 导出日志。
- 由数据库负责人判断后续动作：
  - 修复后继续
  - 恢复数据库备份
  - 放弃本次发布
- 不允许人工随意改 SQL 后直接在生产重跑。

补充要求：

- 失败后要先确认最后一个成功文件与失败文件。
- 未完成数据库状态判断前，不允许进行下一步业务验收。
- 若需继续执行，必须重新完成发布决策确认。

## 11. 回滚策略

必须明确以下规则：

- 当前不提供自动 down migration。
- 当前回滚以数据库备份恢复为主。
- 应用镜像回滚不能自动撤销 schema 变更。
- 如果 migration 已执行，应用回滚前必须确认旧镜像是否兼容新 schema。
- 严重问题时按 `production-rollback-sop.md` 处理。

回滚判断要点：

- 只回滚镜像，不代表数据库自动恢复。
- 若 schema 已变化且旧镜像不兼容，必须优先评估数据库恢复方案。

## 12. Seed 边界说明

- migration 负责 schema 与必要结构演进。
- production seed 负责首发 baseline metadata。
- dev seed 不允许在 `production` / `staging` / `shared` 环境执行。
- bootstrap-admin 负责首个生产管理员。
- 不允许用 dev seed 修复生产缺数据问题。

当前边界依据：

- `scripts/db-seed-prod.sh` 仅在 `ALLOW_PRODUCTION_SEED=yes` 下执行 `000001_s1_production_core.sql`。
- `scripts/db-seed-dev.sh` 对 `NODE_ENV=production`、`APP_ENV=production|staging|shared`、`DISABLE_DEV_SEED=yes` 有防误跑保护；若确需强制覆盖，必须显式设置 `ALLOW_DEV_SEED=yes`。

## 13. 发布后确认

发布后必须确认：

- `check-init-baseline` PASS
- `/api/v1/ready` PASS
- `verify-api-login` PASS
- 核心业务抽样 PASS
- migration 日志已归档
- 备份文件仍保留
- 无 dev seed 污染

建议确认表：

| 检查项 | 结果 | 确认人 | 时间 | 备注 |
|---|---|---|---|---|
| `check-init-baseline` PASS | `<待填写>` | `<待填写>` | `<待填写>` |  |
| `/api/v1/ready` PASS | `<待填写>` | `<待填写>` | `<待填写>` |  |
| `verify-api-login` PASS | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 核心业务抽样 PASS | `<待填写>` | `<待填写>` | `<待填写>` |  |
| migration 日志已归档 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 备份文件仍保留 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 无 dev seed 污染 | `<待填写>` | `<待填写>` | `<待填写>` |  |

## 14. 后续治理计划

### M1：短期强缓解

- 文档化 forward-only
- 冻结历史 SQL
- 禁止重复编号
- 发布时保存日志和文件清单

### M2：中期脚本增强

- 增加 migration history 表
- 增加 checksum
- 增加 `running` / `succeeded` / `failed` 状态
- 同名不同 checksum 直接失败
- 可跳过已成功执行文件

### M3：长期机制演进

- 评估 Flyway / Liquibase / dbmate / TypeORM migration
- 明确 seed 与 migration 分层
- 建立多环境一致发布流程

## 15. Go / No-Go 规则

### Go 条件

- migration 文件清单冻结
- 无新增重复编号
- 数据库备份完成
- 负责人已确认
- 执行日志保存路径已确认
- 失败处理负责人已确认

### No-Go 条件

- 数据库备份缺失
- migration 文件仍在发布窗口内变更
- 存在未确认的新增重复编号
- 执行人或数据库负责人缺席
- 回滚策略未确认
- 生产环境误跑 dev seed

## 16. 签字确认

| 角色 | 姓名 | 结论 | 时间 | 备注 |
|---|---|---|---|---|
| 发布负责人 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 数据库负责人 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 运维负责人 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 回滚决策人 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 业务验收负责人 | `<待填写>` | `<待填写>` | `<待填写>` |  |

## 17. 建议 Issue

1. `govern migration execution history and duplicate numbering`
2. `add migration checksum and status tracking`
3. `document seed and migration ownership boundary`
4. `evaluate dedicated migration framework`
