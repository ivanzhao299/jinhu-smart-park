# 设计

基线ad8e57934f3257926834f333a93c38db3b99ce74。扩展现有工资双轨服务/控制器，不新增DDL或独立影子工作流。

GET /hr/payroll/reconciliations/preparation-cohort，显式legacyBatchId、periodMonth(YYYY-MM-01)、page/page_size；全账套。具体DTO/response由API实现者先核对源表和权限后写入research/api-contract.md，Web按该合同实现，不猜字段。

事务REPEATABLE READ、一致source/receipt/scope/月份校验，SELECT聚合与同manager metadata审计；无业务写入。复用现有insuranceSourceOptions及生产coverage诊断的同月/最新版本语义；逐人名单分页与全量来源统计分开，任何异常计数保留。有效考勤批次必须实际包含该员工，不能把全局一个batch当作每人覆盖。金额完整性/资格/规则业务确认始终未证明。

权限至少工资复核、员工读取、考勤读取、社保读取/金额读取和规则读取；精确常量与现有数据范围由API实现者核实，不能新增角色授权。来源资格和底层字段限制必须沿用现有保护。

Web采用共享DS、ScopedLedgerExport，默认不选批次/月；来自setup的合格staged批次可选，月份用已有实际来源月份发现能力或明确月份输入，绝不从当前日历猜测。逐人清单可在手机只读，核算/维护现有电脑边界保持。

API worker只负责后端/测试/API规范与合同；主代理负责Web/任务及发布。最终独立Trellis check按完整变更审查自修，单生产写者串行发布；不创建生产测试数据。不得复用其他工作区node_modules软链接。
