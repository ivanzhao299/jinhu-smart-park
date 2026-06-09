# JinHu Smart Park Migration History 与 Checksum 设计说明

## 1. 当前机制和风险

当前生产 migration 仍采用 SQL-first、顺序执行的方式，核心流程由 [scripts/db-migrate.sh](/home/veich/JinhuProjects/SmartPark/jinhu-smart-park/scripts/db-migrate.sh) 驱动，输入来源是 `database/migrations/*.sql`。

现状特点：

- 按文件名顺序逐个执行 SQL。
- 没有执行历史表记录每个 migration 的状态。
- 没有 checksum 校验，无法自动识别文件被修改。
- 没有自动 down migration。
- 失败后主要依赖命令日志和人工判断。
- `production seed` 与 migration 是不同职责，不能混用。

当前已观察到的真实风险：

- migration 编号已出现重复前缀，实际文件为 `000136_idempotency_request.sql` 与 `000136_s9f_energy_billing_allocation.sql`。
- 已执行文件无法通过系统表确认。
- 文件内容事后修改无法自动识别。
- 半执行失败后需要人工判断数据库状态。
- 重复执行是否安全依赖 SQL 自身幂等性。
- 回滚主要依赖数据库备份恢复。
- seed 和 migration 边界存在混淆风险。

结论：

- 当前机制可以支撑单次受控发布。
- 当前机制不适合作为长期多环境、多人员、多批次发布机制。
- 因此需要引入最小可落地的 history + checksum 方案，先解决“可追踪、可跳过、可拦截、可回溯”的问题。

与 [production-migration-execution-policy.md](/home/veich/JinhuProjects/SmartPark/jinhu-smart-park/docs/release/production-migration-execution-policy.md) 的衔接关系如下：

- `production-migration-execution-policy.md` 负责当前生产发布的强缓解口径，先保证“怎么安全发”。
- 本文件负责 history + checksum 的最小实现设计，进一步定义“怎么把机制做出来”。
- 两份文档合在一起，形成从风险接受、执行冻结到机制演进的完整路径。

当前最小实现已经落地到 `scripts/db-migrate.sh` 与 `database/migrations/000139_sys_schema_migration_history.sql`。本文件保留为实现契约、验收口径和后续治理路线的统一参考。

## 2. History 表结构设计

建议新增一张专门的 migration 记录表，例如 `sys_schema_migration_history`。

### 2.1 表目标

- 记录每个 migration 的执行状态。
- 记录 checksum，识别文件是否被修改。
- 记录开始/结束时间。
- 记录失败原因。
- 支持已成功执行文件的跳过。

### 2.2 建议字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `uuid` | 主键 |
| `migration_name` | `varchar` | migration 文件名，例如 `000136_idempotency_request.sql` |
| `migration_order` | `integer` | 执行顺序，通常取文件排序位置 |
| `checksum` | `varchar` | 文件内容的稳定摘要 |
| `status` | `varchar` | `running` / `succeeded` / `failed` |
| `started_at` | `timestamptz` | 开始执行时间 |
| `finished_at` | `timestamptz` | 结束时间 |
| `executed_by` | `varchar` | 执行人或执行标识 |
| `executed_commit` | `varchar` | 发布 commit |
| `error_message` | `text` | 失败摘要 |
| `error_sqlstate` | `varchar` | 可选，数据库错误码 |
| `batch_id` | `varchar` | 一次发布批次标识 |
| `is_current` | `boolean` | 可选，标记当前最新执行记录 |
| `created_at` | `timestamptz` | 创建时间 |
| `updated_at` | `timestamptz` | 更新时间 |

### 2.3 索引与约束建议

建议至少配置以下约束：

- `unique(migration_name, checksum)`，用于识别“同名同内容”是否已成功执行。
- `index(status, finished_at)`，用于查询执行中、失败和最近成功记录。
- `index(migration_name)`，便于快速定位某个文件。

若希望更严格，可增加：

- `unique(migration_name, status)` 的业务约束需要谨慎，避免一个文件保留多次失败记录时受到限制。

### 2.4 记录粒度建议

建议保留多条历史记录，而不是只保留一条“最新状态”：

- 同一 migration 文件可以有多次 `failed` 记录。
- 同一 migration 文件可以有一次或多次 `running` 尝试。
- 至少保留最终成功记录，便于审计。

## 3. Checksum 计算规则

Checksum 的目标是判断“同一个 migration 文件内容是否发生变化”。

### 3.1 计算对象

建议以 migration 文件**规范化后的文本内容**作为输入，而不是直接依赖文件系统元数据。

建议纳入的内容：

- 文件完整内容。
- 去除 BOM。
- 统一换行符为 `\n`。
- 保留空白行与空格，避免无意改动被忽略。

### 3.2 算法建议

优先使用稳定、通用的哈希算法，例如：

- `sha256`

输出建议：

- 十六进制字符串。
- 固定长度。

### 3.3 规范化建议

建议在生成 checksum 前做以下规范化：

- 统一换行符。
- 去除 UTF-8 BOM。
- 保持原始 SQL 内容语义不变。

不建议做过度规范化，例如：

- 不建议自动删除全部空白。
- 不建议重排 SQL 语句。
- 不建议把注释忽略到完全看不见。

原因：

- 过度规范化会让“文件真实变化”被掩盖。

### 3.4 与文件名的关系

文件名是 migration 身份的一部分，checksum 代表内容身份。

建议使用组合判断：

- `migration_name + checksum`

而不是只看文件名或只看 checksum。

## 4. `running` / `succeeded` / `failed` 状态语义

### 4.1 `running`

语义：

- migration 已开始执行，但尚未完成。

要求：

- 在真正执行 SQL 前写入。
- 如进程中断，`running` 记录需要在下一次启动时被视为“需要人工判断”的不确定状态。

### 4.2 `succeeded`

语义：

- 该 migration 文件在某个 checksum 下已成功执行。

要求：

- 只有在 SQL 正常完成后才能标记为 `succeeded`。
- `succeeded` 记录可作为“已执行跳过”的依据。

### 4.3 `failed`

语义：

- 该 migration 文件执行失败，且本次尝试没有完成。

要求：

- 记录失败原因摘要。
- 记录失败时间。
- 记录最后一个成功文件与失败文件的关联信息。

### 4.4 状态流转建议

建议状态流转为：

- `pending` -> `running` -> `succeeded`
- `pending` -> `running` -> `failed`

如果保留更简化设计，也可以只落三态：

- `running`
- `succeeded`
- `failed`

其中 `pending` 可由“没有记录”隐含表示。

## 5. 已执行跳过规则

目标是让重复执行幂等化到“已成功文件不重复跑”。

建议规则如下：

1. 如果某个 `migration_name + checksum` 已存在 `succeeded` 记录，则直接跳过。
2. 如果同名 migration 存在 `failed` 记录，但 checksum 相同，则允许在人工确认后重新尝试。
3. 如果同名 migration 存在 `running` 记录，则必须先人工判断是否为异常中断，不能自动继续。
4. 如果同名 migration 已成功，但 checksum 改变，则不能跳过，必须进入“同名不同 checksum 失败规则”。

跳过规则的核心目标：

- 防止已成功执行的 SQL 在重复发布时再次执行。
- 保持发布过程可重复运行而不破坏数据库。

## 6. 同名不同 checksum 失败规则

这是最重要的防护规则之一。

规则建议：

- 发现同一个 `migration_name` 已存在 `succeeded` 记录，但当前文件 checksum 与历史成功记录不一致时，直接判定为失败。
- 该情况必须阻止继续执行后续 migration。
- 该情况必须要求人工介入并确认是否存在“已执行文件被修改”的风险。

建议错误提示：

- `migration file changed after success`
- `same migration name with different checksum`

处理原则：

- 不允许把“同名不同内容”当作普通重试。
- 不允许自动覆盖旧记录。
- 不允许自动继续执行后续文件。

## 7. 执行失败后的恢复流程

建议恢复流程按以下顺序执行：

1. 立即停止后续 migration。
2. 保留数据库现场和容器现场。
3. 导出执行日志。
4. 确认最后一个成功文件与失败文件。
5. 确认失败类型：
   - SQL 语法错误
   - 约束冲突
   - 数据不兼容
   - 事务中断
   - 人工中断
6. 由数据库负责人判断：
   - 修复后继续
   - 恢复数据库备份
   - 放弃本次发布
7. 若要重新执行，必须重新完成风险接受和前置条件确认。

恢复原则：

- 不能假设失败后只需“再跑一次”。
- 不能假设失败文件一定是无副作用。
- 不能跳过数据库负责人确认。

## 8. 和 production seed / bootstrap-admin 的边界

### 8.1 migration

- 负责 schema 演进和必要结构变更。
- 由 migration history + checksum 体系管理。

### 8.2 production seed

- 负责首发 baseline metadata。
- 不负责 schema 演进。
- 不负责修复 migration 引起的问题。

### 8.3 bootstrap-admin

- 只负责首个可登录管理员。
- 不负责补 migration 缺失。
- 不负责补 production seed 缺失。

### 8.4 dev seed

- 只能用于本地开发或受控验证。
- 绝不能作为生产补救手段。

边界原则：

- migration 和 production seed 必须在执行策略里分开管理。
- bootstrap-admin 只属于首发初始化闭环中的一环，不参与 migration 记录逻辑。

## 9. 对现有历史 SQL 的兼容策略

当前仓库已经有一批历史 SQL，不能推倒重写。建议采用“兼容优先”的渐进策略。

### 9.1 历史 SQL 冻结

- 已经合入并执行过的 SQL 文件视为历史文件。
- 历史文件原则上不再修改。

### 9.2 新增 SQL 规则

- 新增 migration 必须使用唯一编号。
- 新增 migration 文件必须参与 checksum 记录。
- 新增 migration 文件必须进入清单冻结流程。

### 9.3 首次接入 history 表时的兼容

建议对历史文件采用以下处理之一：

- 方案 A：首次启用 history 表时，先把“已知已执行”的历史 migration 做基线登记。
- 方案 B：只从启用日之后的新 migration 开始记录，历史文件作为只读基线。

对于当前项目，更现实的方式是：

- 先完成历史基线登记或人工映射。
- 再从启用日起强制 history + checksum。

### 9.4 重号处理

- 已有重号文件必须在设计层面保留问题记录。
- 未来不得再新增重号。
- 对已存在重号，运行时必须用“文件名 + checksum + 执行顺序”联合判断，不能只看前缀编号。

## 10. 分阶段实施计划

### M1：最小可落地

目标：

- 不改现有 migration SQL。
- 不改业务代码。
- 先定义 history 表、checksum、状态语义、跳过规则。
- 与生产执行策略保持口径一致，先完成文档冻结和风险接受。

交付：

- 设计文档
- SQL 执行策略文档更新
- 发布流程口径更新

推荐落地顺序：

1. 先确认 `production-migration-execution-policy.md` 已覆盖备份、冻结、签字和 No-Go 条件。
2. 再新增 migration history 表的 SQL，确保脚本启动前可以 bootstrap 记录表。
3. 然后增强 `scripts/db-migrate.sh` 的记录、跳过、阻断、失败回写逻辑。
4. 最后用临时数据库做首次执行、重复执行、checksum 冲突和失败重试验证。

### M2：脚本增强

目标：

- 在不更换 migration 框架的前提下，给脚本加 history/checksum/status。
- 优先沿用当前 SQL-first 执行方式，只补可追踪、可跳过、可阻断能力。
- 这一步已经以最小可落地形式实现，后续重点转为验证、收口和运行治理。

交付：

- migration history 表
- 记录/查询/跳过逻辑
- failed / running / succeeded 状态保存
- 同名不同 checksum 阻断

### M3：治理收口

目标：

- 把 seed、migration、bootstrap-admin、备份、日志、审批变成统一流程。
- 把生产执行策略与 history/checksum 实现合并为一套稳定发布流程。

交付：

- 多环境发布制度化
- 失败恢复操作标准化
- 审计可追踪

### M4：长期演进

目标：

- 评估是否迁移到成熟工具链。

候选：

- Flyway
- Liquibase
- dbmate
- TypeORM migration

## 11. 建议修改文件

本阶段为设计阶段，建议后续可能修改的文件如下：

- `docs/release/migration-history-checksum-design.md`
- `docs/release/production-migration-execution-policy.md`
- `docs/release/production-release-sop.md`
- `docs/deployment/production.md`

如果后续进入实现阶段，再考虑：

- `scripts/db-migrate.sh`
- migration history SQL
- 相关数据库初始化脚本

## 12. 验收标准

设计方案达到以下标准后可进入实现阶段：

- 能明确回答某个 migration 是否执行过。
- 能明确回答某个 migration 何时执行、谁执行、成功或失败。
- 能识别“同名同 checksum 已执行”并跳过。
- 能识别“同名不同 checksum”并阻断。
- 能在失败后定位最后一个成功文件和失败文件。
- 能在发布策略中区分 migration、production seed、bootstrap-admin 的职责。
- 能在历史 SQL 共存场景下保持兼容。

## 13. 回滚策略

当前设计阶段的回滚策略以“数据库备份恢复”为主，而不是自动 down migration。

原则：

- migration 已执行且产生 schema 变化时，应用镜像回滚不能自动撤销 schema。
- 若后续实现 history/checksum 逻辑出错，仍可通过备份恢复兜底。
- 设计阶段不承诺自动回滚，只承诺可追踪、可阻断、可恢复。

## 14. 建议 commit 拆分

建议后续实现前的文档提交拆分为：

1. `docs: add migration history checksum design`
2. `docs: update production migration policy with history design`
3. `docs: align release SOP with migration history workflow`
