# PMA M-02/M-06 leasing 批量 SQL 与锁顺序闭环

## Goal

关闭 GitHub Issue #683：治理传统 leasing command/query 与民宿 finance 查询中已确认的批量 SQL、锁顺序、金额守恒和逐条审计缺口，并为代表性路径建立可执行的 statement/deadlock 回归门禁。

## Confirmed facts

- `generate-batch` 按合同逐个进入事务，合同数组没有大小上限；单合同生成又按 spec 查询/插入/回读。
- payment apply 在事务前、事务内均逐个读取应收，且按请求顺序加锁；application 数组没有大小上限。
- invoice allocation 按请求顺序逐应收加锁并逐项汇总，随后重锁/重算；invoice 数组没有大小上限。
- invoice update/delete 当前先锁 invoice 再锁 receivable；waiver approve 先锁 waiver 再锁 receivable；这与 receivable-first 金融层级不一致。
- checkout 与 contract/unit 锁已有稳定的父级到子级顺序；homestay mutation 已按 booking、source、ledger ID 排序加锁，不应无依据改写。
- payment/waiver/invoice 已有金额公式与状态日志，但缺少对批量前后总额守恒、每个受影响应收审计行的直接断言。
- `generate-batch` 必须保留逐合同部分成功结果和 guard-only 语义，不能通过挂通用 interceptor 宣称完整幂等。

## Requirements

- 建立并在任务记录中维护完整锁顺序清单。统一受影响的 leasing 金融写路径为：已知父级合同/单元锁在前；多个 receivable 按稳定 ID 顺序一次锁定；随后 payment/invoice/waiver 等子聚合。不得破坏既有 contract→unit 与 homestay booking→source→ledger 顺序。
- payment apply 与 invoice allocation 使用批量 `IN` 查询和稳定排序取代逐项 receivable 查询/锁；批量聚合查询取代逐项 sum 查询。
- `generate-batch`、payment applications、invoice receivables 设置显式、可测试的数组上限；保留 `generate-batch` 每合同独立失败/成功结果，不把一个合同失败扩大为全批失败。
- 对代表性批量路径建立 statement-count 断言，证明 SQL 数量不随 application/allocation 条数线性增长；对无法安全一次性重构的 per-contract 生成，以明确 batch cap 限定请求预算。
- 对 payment 核销和 receivable batch generation 在事务内以分为单位断言金额守恒；浮点误差不得作为守恒依据。
- 每个实际变更的 receivable 都有对应状态/动作审计；测试必须断言多行批量不是只记录第一条。
- 添加真实 PostgreSQL 双事务交叉用例，证明相同 receivable 集合的不同输入顺序按同一顺序锁定且无死锁。
- 民宿 finance query 将已确认的逐 source snapshot 查询批量化，保持 tenant/park/booking 边界及 ledger 金额口径。
- 不新增数据库迁移；不改 HR、生产数据、生产服务、他人容器或主 Chrome。

## Acceptance criteria

- [ ] 锁顺序清单覆盖 contracts/checkouts/receivables/payments/invoices/waivers 与 homestay finance，并标记修复前后差异。
- [ ] payment/invoice 代表性批量输入的 statement-count 有固定上限，不随 1→N 条输入线性增长。
- [ ] generate-batch 与其他批量数组有 DTO 上限，超限在进入 service/SQL 前拒绝。
- [ ] 双事务以相反输入顺序锁定相同应收集合时均完成且无 PostgreSQL deadlock。
- [ ] payment batch 核销、receivable batch generation 的分值总额守恒；失败合同不污染成功合同。
- [ ] 多应收批量变更产生逐条完整的审计/状态日志。
- [ ] homestay finance approval-source 查询不再逐 source 发 SQL，返回金额口径不变。
- [ ] 相关 unit/PG tests、S3C、相关 first-release leasing 回归通过；环境性跳过如实记录。
- [ ] review 不超过三轮；PR CI 与合入后的 main CI、Deploy 均绿后关闭 #683 并归档任务。

## Out of scope

- 把 leasing/housing 合并成单一领域模型。
- 全仓 query-budget 框架或通用事务抽象。
- 为 `generate-batch` 添加 `IdempotencyInterceptor` 或声称其具备 replay/conflict 完整语义。
- 与本问题无关的 DTO、UI、schema 或 migration 重构。
