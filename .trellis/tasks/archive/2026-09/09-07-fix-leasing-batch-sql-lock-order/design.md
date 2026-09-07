# Design

## Lock hierarchy

本任务采用局部、可证明的固定顺序：合同/单元等父聚合保持既有顺序；金融路径先按升序锁全部 receivable，再锁 payment/invoice/waiver 子聚合。所有多 ID 锁查询都显式 `ORDER BY id ASC`。homestay 继续使用 booking→source advisory/source row→confirmed ledger ID→legacy row ID。

payment apply 先完成纯输入校验，再在事务内批量锁定应收，随后锁 payment 并基于锁后快照校验和写入。invoice update/delete 先从输入或当前 allocation 得到完整 receivable ID 集合，批量锁定，再锁 invoice 并复核 allocation；waiver approve 先锁目标 receivable，再锁 waiver。这样消除同一实体集合因请求顺序或聚合入口不同造成的反序。

## Statement budget

DTO 使用共享常量定义有限批量上限。payment 与 invoice 将 N 次 receivable 查询合并为一次 `IN (:...ids)`，invoice 的已开票金额及重算金额使用按 receivable ID 分组的单次聚合。批量 save 保留每行实体与审计语义。`generate-batch` 保留每合同独立事务与部分成功，使用合同数上限形成硬预算；其 per-contract 复杂生成不在本轮改成跨合同大事务。

homestay approval-source snapshot 将 candidate source keys 一次传入聚合查询，再按 key 映射回响应，避免 `Promise.all(map(query))`。

## Money and audit invariants

金额比较统一转成整数分。payment apply 断言：交易前 payment unapplied cents = 交易后 unapplied cents + application cents；每个 receivable 的 remain decrease = applied cents，且 paid increase = applied cents。generation 断言每个新生成 receivable 的 due = remain、paid/waived = 0，并对请求预期生成金额与实际 created rows 汇总进行守恒核验；skipped/failed 行不计入 created 总额。

每个发生状态/开票状态变化的 receivable 仍逐条保存日志。测试直接验证受影响 ID 集合与日志集合相等，批量持久化不能只保留第一行。

## Compatibility and rollback

保持 controller contract、部分成功响应、现有状态码、soft-delete、field policy 与 idempotency 行为。无 schema/data migration。回滚为源代码与测试提交反向撤销；既有财务记录无需数据回滚。
