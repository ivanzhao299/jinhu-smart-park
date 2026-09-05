# 玉舟绩效事实生产装载器合同

## 本切片结论

`000311_hr_yuzhou_performance_facts_production.sql` 为六类旧绩效事实提供受控、可重放和可回滚的生产数据库接口。它复用 `000301` 与 `000303` 已验证的映射过程，不复制第二套字段转换逻辑。

本切片只证明装载能力。当前权威源回执中的 `assessmentdetail` 与 `assessmentmaster` 都是空集，因此真实来源的结果事实状态仍为 `AUTHORITATIVE_EMPTY`，真实非空生产 UAT 为 `NOT_CLAIMED`。合成 PostgreSQL 测试中的非空记录只用于证明接口、外键和回滚能力，不能作为真实玉舟数据非空的证据。

## 生产顺序和可见性

实际外键依赖要求顺序为：

1. `000311` 装载配置、明细和汇总事实；六类 owner map 初始保持 `loaded`。
2. `000308` 装载周期、评分来源和评分人关系；三类 owner map 初始保持 `loaded`。
3. `000310` 建立事实身份解析，在全部守恒通过后，把本批次精确的六类事实 map 和三类关系 map 一次性晋级为 `verified`。

查询端继续只读取 `verified`，不能放宽为读取 `loaded`，从而避免半成品链进入业务页面。核心 T0 的 owner map 晋级由总生产 writer 负责，不属于本切片。

回滚必须反向执行：全部事实身份 → 绩效关系 → 绩效事实。`000311` 只允许在同一导入操作下不存在下游回执，或已有的 `000310` 与 `000308` 回执都已完成回滚时删除事实。删除顺序为汇总结果、维度结果、等级说明、维度、等级规则、模板，并核对六表和活动 map 都为零。

## 密封和运行时绑定

密封计划属性为 `performanceFactLoader`，授权绑定属性为 `performanceFactLoaderContractSha256`。稳定合同同时绑定：

- C/S/M、目标范围和 T0 回执；
- 源恢复回执、事实定位回执及其规范摘要；
- 两个私有 payload 字节哈希；
- `000300`–`000303`、`000310`、`000311` 的迁移哈希；
- 六类行数、活动 map 总数、两类身份事实集哈希和六类完整事实集哈希；
- 固定前向和回滚顺序。

元数据中的 `productionImport` 固定为 `HOLD`。真实执行权只来自总生产封套的一次性授权，不能由此字段自行声明。

## 数据库接口

- 只读探针：`hr_yuzhou_performance_facts_production_capability_v1()`
- 前向写入：`hr_yuzhou_apply_performance_facts_production_v1(...)`
- 逆向回滚：`hr_yuzhou_rollback_performance_facts_production_v1(...)`
- 身份依赖核验：`hr_yuzhou_performance_fact_loader_dependency_valid_v1(...)`
- 同事务窄回执链：`hr_yuzhou_performance_production_receipt_chain_v1(...)`

回执链函数在一个 advisory transaction lock 下核对 `000311`、`000308`、`000310` 的 operation、batch、sealed plan、C/S/M、scope、T0、父回执和事实集，只返回三个回执 SHA。writer 角色不获得底层回执表 `SELECT` 权限。

## 验证边界

专项合同测试检查密封绑定、字节哈希预验证、稳定错误码、严格 PostgreSQL 类型解析和最小权限。直接 PostgreSQL 测试从零执行迁移链，先用原始 `000301/000303` 生成六类合成聚合，再证明错误 T0 零写入、生产前向写入、精确重放、依赖 hook、逆向重放及零残留。

候选总入口已经把 `000311 → 000308 → 000310` 串接，并用运行时三个真实回执驱动逆序回滚。首轮合成隔离 PostgreSQL 总链已验证空事实装载、非空周期/人员关系、自动晋级及失败零残留；精确执行字节和覆盖边界见 `docs/yuzhou-hr-performance-fact-identity-integration.md`。非空配置、实际服务查询以及真实生产闭环仍未完成验收；当前真实空集不能替代未来找到权威非空快照后的业务 UAT。
