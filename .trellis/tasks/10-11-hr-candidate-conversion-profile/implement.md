# Execution

1. 单代理实现内部资料衔接函数和转换集成，不修改历史数据或现有全量替换档案方法。
2. 定向测试填空/保留/权限/损坏/长度/冲突/唯一约束/审计失败；隔离数据库验证事务回滚与版本。
3. API定向lint、typecheck与相关转换回归；新增行为文档和短检查点。
4. 等PR953发布链路完成，刷新主分支并完成代码审查、CI、部署和运行版本证明。真实角色验收另列，不能替代。

CostGuard：停止新增代理与重复扫描，保留现有发布进程62380，仅执行该业务闭环所需步骤。

## Validation checkpoint
15 focused unit tests PASS; targeted ESLint PASS; API typecheck PASS. Three sequential full-schema PostgreSQL tests PASS with zero skips: transfer, recruitment conversion and requisition continuity. Includes exactly-once conversion, target preservation, permission/source/identity/audit failure transaction rollback. Isolated database dropped, zero residual, no production business writes. Two initial TypeScript diagnostics resolved by explicit never helper and explicit optional receipt type; no business test failures. PR953 merged181d74a6c4cebc6e959f8d40fcd5848647194320, deployment38113724022 pending runtime proof.
