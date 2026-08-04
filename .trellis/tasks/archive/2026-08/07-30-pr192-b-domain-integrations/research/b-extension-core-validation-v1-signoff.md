# B-extension-core validation v1 独立签署

日期：2026-08-02  
状态：PASS / CLOSED  
Owner：migration-reconcile-owner  
独立复审：架构 GO；QA GO；`P0/P1/P2=0`。

## 唯一 handoff

- Grammar：`b-extension-core-validation-v1.grammar`
- Grammar bytes：`1292`
- `B-extension-core validation SHA`：
  `9470a733f65b85efab9461f7abab0697106765527cbb7cce5858f889f3239abe`
- 编码合同：UTF-8、无 BOM、LF-only、固定字段顺序、恰好一个末尾 LF。
- Grammar 不包含自身路径、bytes 或 SHA；本签署只做单向引用，避免自引用。

## 独立复算结论

- Artifact、manifest、reservation 的相对路径、bytes、raw SHA、mode `0600` 及相互绑定
  均与唯一正式 run `c2v11_formal_20260802l` 一致。
- 51 个冻结输入在四阶段无漂移，freeze SHA 均为
  `7db5b805b676dd79d3bd7fec503f19b8a65e419a8684eb89cc7101176ad58a2e`。
- Profile、expected-mutations、validator、fixture、validation-data 与 combined checksum
  均从正式证据和当前冻结文件重新推导一致。
- 两套 fresh run 的 A 状态不变、B 状态可重复；二次执行为精确 no-op，第三次重建
  同一 snapshot，两轮 rollback residual 为零。
- 两套容器、匿名卷和物理临时文件均已清理，`open_P0_P1=[]`。

## 消费规则

本 SHA 是 migration-reconcile-owner 发布的唯一 validation handoff。B-2c 必须同时消费
fixture SHA `5c7f6794…ca56` 与本 validation SHA；不得用 validation-data fingerprint、
validator raw SHA、expected-mutations SHA 或 combined checksum 单独替代。
