# 本地验证

- 基线/生产：9bb512abc440b4364c26f01922ae9169322ea4de。单代理，复用已有隔离工作区与PostgreSQL容器。
- `node --check` 两个修改的可执行脚本：通过。
- `node --test scripts/e2e/hr-payroll-source-coverage.contract.mjs scripts/e2e/hr-payroll-readiness.contract.mjs`：9项通过。
- `HR_PAYROLL_READINESS_PG=1 POSTGRES_DB=jinhu_hr_migration_lab_review_inscov_20261011 node --test scripts/e2e/hr-payroll-readiness.pg.mjs`：2个真实PostgreSQL测试通过。
- 唯一自建数据库由template0创建，恢复前序000361完整迁移验证产出的schema-only结构；本轮未宣称重新执行全量迁移。所有约束/触发器保持启用。测试后删除自建数据库。
- 案例：合格/不合格批次、多账套同人、历史可用/待核/已删除/异月/异范围、现代最新修订、来源分类守恒、数据库唯一性拒绝重复历史期间、只读写拒绝。
- API/Web代码、依赖、迁移和业务写路径未改，本轮不重复其本地全量构建；CI/发布检查仍保留。
- 页面未改，不重复浏览器页面测试。生产真实人员/金额不进入报告。
- 生产候选只读观察、合并和发布结果尚待完成，不能以测试代替。

## 成本记录
采用单代理，复用依赖和数据库容器，测试仅涉及修改脚本与现有同域合同；不重复历史导入、业务计算或全量本地构建。实际本轮token/费用计量不可用，不记为零。真实数据库最后一轮测试约1秒，另有schema恢复时间。根因修复重试0；测试补充后按输入变化进行一次干净复测。
