# Design: 000200 runtime-control 合同链兼容

## Failure model

实际 runner 按文件名执行 000194、000195、000200。000195 将同一组 12 条 runtime-control 从 expand 合同推进到 v3 最终合同；000200 仍把 expand 合同当作唯一合法状态，因此在任何非空生产作用域上确定性失败。空库 CI 因迁移时尚未执行 production seed，目标作用域为空，形成了假绿。

## Safety boundaries

- 000001–000199 均视为不可变历史。
- 不通过 prerequisite 把 v3 降回 v1；prerequisite 与 target 是分离事务，降级会产生崩溃窗口并破坏审计链。
- 不在未知数据上 UPDATE/DELETE。所有兼容分支先验证完整集合、版本、hash、reason 和审计证据。
- 成功 checksum 兼容只接受单个已知旧 checksum，并要求数据库效果与新版本可证明等价；其余情况 fail closed。

## Migration behavior

000200 根据历史阶段选择唯一合法合同：

1. 若 000194/000195 尚未成功，保留原 expand 初始化与 exact-set 检查，服务已有直跑回归。
2. 若两者在双 history 中均成功，则要求每个有效 scope 已完整处于 000195 v3 状态，且对应 000194/000195 审计证据存在；000200 只验证并保留，不降级定义。
3. 历史不一致、阶段部分完成、集合混合、缺失、extra 或 definition drift 均中止。

000200 immutable source 保持字节不变。`database/migration-replacements.txt` 固定 source、unified patch、
generated SQL 三重 SHA-256；runner 仅对 history 缺失或 failed 的目标生成并执行 replacement。若目标已按
immutable source checksum 成功，则只跳过且不改写 history；若按 generated checksum 成功也正常跳过；
其余成功 checksum 一律拒绝。

## Prevention

- 把现有 000194 retry 回放扩展为完整依赖尾链，fixture 在迁移前已有 active assignment，覆盖生产真实顺序。
- 扩展既有 000194 只读诊断和部署前 enforce gate，使其按 000194/000195 双 history 阶段校验 v1/v2/v3，执行位置继续早于 release marker、源码同步、镜像构建和服务切换。
- 在迁移合同静态测试中冻结阶段判定、checksum 兼容边界、只读门禁和完整尾链命令。
- 将“非空生产形态必须跑完整依赖尾链”写入 Trellis project operations spec。

## Rollout and rollback

先在 disposable PostgreSQL 上回放生产失败状态及旧直跑状态，再由 CI Release Smoke 验证。部署仍保持 source snapshot rollback；数据库迁移自身事务失败即回滚，已成功的前序迁移不逆转。任何兼容证明失败都在服务替换之前由只读门禁阻断。
