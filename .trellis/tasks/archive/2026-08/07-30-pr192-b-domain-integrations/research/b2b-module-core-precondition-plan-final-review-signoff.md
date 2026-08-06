# B-2b module-core 前置门禁纠偏计划最终复审签署

日期：2026-08-01  
结论：GO  
放行范围：仅 M 阶段 module-core 独立测试门禁；不得提前写 B-extension fixture。

## 权威计划

- 路径：`.trellis/tasks/07-30-pr192-b-domain-integrations/research/b2b-module-core-precondition-correction-plan.md`
- 原始 SHA-256：`10e028dec2d25df8d95352f85cc66f9b3380c575a6d1635269c25171409fadb7`

## 复审结论

- 架构/合同复审：GO，P0=0、P1=0、P2=0。
- QA/迁移/安全复审：GO，P0=0、P1=0、P2=0。
- 联合确认：缺失独立 `B-module-core SHA` 的诊断成立；补门禁必须先于 B-2b
  PostgreSQL/fixture 写入；11 行审批联合矩阵与数据库状态组合约束一致。

## 已关闭问题

- 已补齐 stop-ship 和 current runtime effect authority 输入。
- 已冻结 module tree 13 个生产文件 + 1 个 targeted spec 的 exact byte grammar。
- 已增加 M 阶段真实 PostgreSQL/Nest 行为 Gate。
- 已增加四阶段输入冻结、精确 Docker cleanup authority、迁移顺序和 exact matrix。
- 正式 reservation 必须保留；仅临时锁、容器、匿名卷和未签 fixture residual 清零。

## 下游约束

M 阶段只有在独立 PostgreSQL Gate、targeted spec、typecheck、build、lint、迁移合同、
源码路径集与 diff 边界全部通过后，才允许签署 `B-module-core SHA`。在此之前，
B-2b fixture、B-2c 及后续阶段继续 blocked。
