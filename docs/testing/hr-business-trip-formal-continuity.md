# 出差正式申报与批准后更正验证

正式业务字段为 `declared_days`，原 `legacy_declared_days` 继续保存来源证据。迁移366仅初始化现有出差值；首次插入历史出差时也从来源值初始化，因此既有封装导入列、来源摘要和数据包格式不变。后续平台更正不改来源字段，重复添加采用冲突跳过，不能用来源值覆盖已维护的正式值。

创建及本人草稿/退回编辑使用原 REQUEST 流程，省略保留、null 清空、零为有效值；新输入为非负整数。已批准出差通过 OPERATE 更正入口维护，要求当前版本、原因和事务审计，保留原审批链和批准状态，历史只追加。历史值中的负数不在迁移时改写。

日结果记录出差 ID、版本和正式天数，月结复制来源。更正后必须重算实际受影响日期；复核月份重开，计算中拒绝修改，已封账快照不变，通过明确更正批次续算。此字段不定义计薪天数、出差补贴或加班倍率。

## 聚焦验证

```sh
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-business-trip-formal.spec.ts src/modules/hr/hr-attendance-request.spec.ts src/shared/interceptors/idempotency.interceptor.spec.ts
pnpm --filter @jinhu/web test:unit:interaction test/interaction/hr-business-trip-declared-days.test.tsx test/interaction/hr-attendance-request-workflow.test.tsx test/interaction/hr-attendance-approved-recalculation.test.tsx
```

真实 PostgreSQL 出差测试使用已完整迁移的独立临时数据库。必须设置 `HR_TRIP_FORMAL_PG_REQUIRED=1`、`HR_TRIP_FORMAL_ISOLATED=yes` 及普通 `POSTGRES_*` 连接变量；仅允许 loopback 上命名为 `jinhu_hr_migration_lab_trip_formal_<8位十六进制>` 的自有测试库，或 GitHub Actions 的 `jinhu_release_smoke`。禁止连接生产库，禁止把连接密码写入输出。测试与日计算、月结以及草稿编辑回归顺序执行，结束删除自有数据库并核实不存在。

CI 的必需 Release Smoke 已启用此 PostgreSQL 测试，验证首次导入 null/零/正负整数、冲突跳过不覆盖、权限/园区、并发版本、审计回滚、平台新增审批后更正、陈旧日依据、封账快照及明确更正续算。页面交互覆盖失败保留、同键重试、匹配回执、身份/版本漂移和完整分页。

浏览器使用实际考勤组件与全局样式，在390及1280宽度核对表单、历史、按钮和文字留白；合成数据截图仅是本地组件证据。发布仍须验证 CI、迁移、健康、Docker清理和 API/Web实际运行版本；真实角色业务验收和2026年7月全量“只算不发”金额核对单独记录，不能由本页技术测试替代。
