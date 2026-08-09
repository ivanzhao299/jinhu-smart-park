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

## Bug Analysis: 发布级 seed 决策被环境文件覆盖

### 1. Root Cause Category

- **Category**: B/D/E — 跨层合同、测试覆盖缺口与隐式假设。
- **Specific Cause**: workflow 把 `RUN_PRODUCTION_SEED=yes` 作为命令环境传入远端，但 `prod-deploy.sh`
  随后 source 常驻 `.env.production`，其中默认 `RUN_PRODUCTION_SEED=no` 覆盖了本次发布决策。工作流日志显示
  `yes`，迁移和健康检查也成功，因此形成“绿部署但未执行 seed”的假象。

### 2. Why Fixes Failed

1. 前序修复验证了 workflow 的 mode/seed 输出与诊断门禁，但没有观察 `prod-deploy.sh` source 环境文件后的最终值。
2. Release Smoke 直接执行 migration/seed，未经过生产部署脚本的环境加载边界，无法捕获优先级反转。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Architecture | source 前捕获显式发布决策，source 后恢复；环境文件只作未显式传参时的默认值 | DONE |
| P0 | Runtime | `RUN_PRODUCTION_SEED` 非 `yes|no` 时在任何 mutation 前失败 | DONE |
| P0 | Test | 回放 `CI yes/env no`、`CI no/env yes`、无覆盖回退、非法值四种情况 | DONE |
| P1 | Documentation/spec | 固化发布控制面优先于常驻配置的合同 | DONE |

### 4. Systematic Expansion

- **Similar Issues**: 所有“命令行/工作流一次性决策 + 脚本内部 source `.env`”组合都可能发生同类覆盖。
- **Design Improvement**: 区分 release control-plane 参数与 application configuration；前者不得由常驻应用配置反向覆盖。
- **Process Improvement**: 部署脚本变更必须至少有一个经过真实 env 加载顺序的 focused regression，不能只测 workflow 文本。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/guides/project-operations.md`。
- [x] 更新生产部署与 runner release 文档。
- [x] 新增可执行优先级回归并接入 Verify。

## Bug Analysis: Track B seed 把 scope 存在性误写成业务行唯一性

### 1. Root Cause Category

- **Category**: B/D/E — 跨层合同、生产形态覆盖缺口与隐式唯一性假设。
- **Specific Cause**: `000006` 只需要固定 tenant/park scope 存在，后续权限写入不选择或读取某一条
  `biz_park`；预检却要求该 scope 恰好一条 active park。生产历史数据在同一 scope 下合法保留 `CSYQ,JH`
  两条业务园区，因此完整 seed 重放在任何写入前 fail closed。

### 2. Why Fixes Failed

1. fresh-schema seed 只有一条同 scope park，无法覆盖生产历史的多业务行形态。
2. 前序部署长期没有真正执行 production seed，过度约束直到控制面修复后才暴露。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Contract | 仅需 scope 存在时检查 `count >= 1`；只有真正选择唯一来源时才要求 exact-one | DONE |
| P0 | Test | fresh-order 数据库插入第二条同 scope active park，再完整重跑 production seed | DONE |
| P1 | Spec | 将 scope 存在性与业务来源唯一性分离写入 project operations | DONE |

### 4. Systematic Expansion

- **Similar Issues**: 其他 seed/preflight 若只按 tenant/park 写元数据，也不应把同 scope 业务行数当唯一性合同。
- **Design Improvement**: 预检计数必须与后续 SELECT 的真实基数需求一致。
- **Process Improvement**: 每个生产新分类都进入 deterministic PostgreSQL fixture 后再重试部署。

## Bug Analysis: 受保护 UAT 权限缺口与 Release Smoke 假绿

### 1. Root Cause Category

- **Category**: B/C/D — 角色合同漂移、变更传播失败与 CI 失败传播缺口。
- **Specific Cause**: 历史 000171 是一次性迁移；当它执行时旧 `INVEST_MANAGER` 模板可能尚不存在，
  后续 2026 责任分工又引入 `JH_LEASING_LEAD`。生产账号仍可能绑定任一受审别名，导致部署、seed、健康
  和 cleanup 均成功后，受保护 UAT 仍缺少 `workorder:create`。
  同时 Release Smoke 的命令通过 `tee` 输出日志但未显式启用 `pipefail`，seed 的 exit 3 被 `tee` 的 0 掩盖。

### 2. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Least privilege | 新 production seed 仅为固定 scope 的 active `INVEST_MANAGER` / `JH_LEASING_LEAD` 补 `workorder:create`，绝不按用户名推导角色 | DONE |
| P0 | Fail closed | 角色存在但非 active、重复角色或权限缺失时事务失败；角色尚未导入时安全 no-op | DONE |
| P0 | CI truth | workflow 默认 shell 显式 `-eo pipefail`，所有 `tee` 管道保留生产者退出码 | DONE |
| P0 | Test | production-shaped fixture 创建当前责任角色，完整 seed 后断言唯一 grant | DONE |

### 3. Systematic Expansion

- **Similar Issues**: 旧模板角色与当前责任分工角色 code 不同，不能假设给旧角色补权会传播到当前用户。
- **Design Improvement**: 生产权限修复必须从受保护 UAT 的当前 role assignment 反推最小 grant。
- **Process Improvement**: release 命令只要接 `tee` 就由 workflow 级 `pipefail` 统一保证失败传播。
