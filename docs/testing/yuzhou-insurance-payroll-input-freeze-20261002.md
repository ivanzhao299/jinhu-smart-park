# 社保事实纳入工资模拟输入证据

原实现只冻结社保期间ID和版本，没有保存实际明细金额，且允许待核对期间进入模拟。现在冻结期间及有效明细的ID、版本、类型、基数、个人/单位/合计/补缴金额及原始负基数标志；金额保留PostgreSQL十进制字符串，NULL保持NULL，不从政策重新计算旧结果，不读取账户或源载荷。快照标记为`insurance-facts-v1`，纳入已有输入哈希；已有模拟回执不改写。

待核对期间会在创建模拟运行前拒绝。期间和明细按稳定顺序锁定；父行FOR UPDATE及子行FOR SHARE保护冻结过程，实际数据库测试覆盖并发新增明细。一次性历史导入、工资历史发布、正式工资/工资条和发薪均不由本切片触发。

本地聚焦测试18项、API类型检查和相关文件ESLint通过。真实PostgreSQL使用独立localhost临时容器，从原始迁移执行至321，无数据库缓存；两条服务级集成测试均已实际执行并通过（未发布冻结来源路径1项、历史已发布路径1项，均非skip）。测试保留大额基数`90071992547409.91`的精度和NULL补缴值，验证待核对拒绝时运行/审计无残留、明细变化即使期间版本未变也改变输入哈希、旧回执保持原值，以及并发新增明细SQLSTATE 55P03。临时数据库及凭据已清理。已有已发布路径测试原先假设空库有园区；改为独立合成范围并增加localhost实验数据库限制后补跑通过。源路径证据在相应代码和输入未变化时复用，不把首次组合运行记为全部通过。

验证命令：

- `pnpm --filter @jinhu/api exec tsc --noEmit`
- `pnpm exec eslint apps/api/src/modules/hr/hr-payroll-history.service.ts apps/api/src/modules/hr/hr-payroll-reconciliation-source.pg.spec.ts apps/api/src/modules/hr/hr-payroll-reconciliation-source.spec.ts`
- 聚焦单元：`hr-payroll-reconciliation.contract.spec.ts`、`hr-payroll-reconciliation-source.spec.ts`、`hr-payroll-formula-dsl.spec.ts`。
- 独立全模式数据库：`HR_RECONCILIATION_SOURCE_PG=1`运行`hr-payroll-reconciliation-source.pg.spec.ts`，及隔离URL/明确允许标志下运行`hr-payroll-reconciliation.pg.spec.ts`。不允许生产执行这些写入测试。

剩余缺口：当前在线社保政策维护/确认/更正、社保金额公式连接及真实期间的业务对账仍未验收。空明细只代表没有记录，不代表应缴为零；不能把金额已经冻结当作已经完成社保核算或完整工资闭环。本次没有修改前端，无新增页面浏览器验收；尚未部署生产。
