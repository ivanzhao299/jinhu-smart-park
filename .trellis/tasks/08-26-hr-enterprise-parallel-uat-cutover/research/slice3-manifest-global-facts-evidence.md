# Slice 3 — Parent manifest 与 PostgreSQL 全域事实证据

## 实现范围

- `parent-manifest.mjs`：规范 JSON hash、不可变写入、append/supersede 单链验证、实际 evidence bytes/mode/realpath/hash 与敏感扫描。
- `verify-global-facts.sql`：只读事务直接计算 PostgreSQL numeric ledger、detached approved-ignore、六类 owner/map、锁定 side-effect 与 canonical domain/global hash。
- `verify-global-facts.mjs`：只允许 full-domain lab 数据库，调用数据库只读 verifier，比较 A/B 数据库事实并拒绝 manifest 自报漂移。
- Slice 2 lifecycle：fixture 写入明确的合同验证事件；lab 在 `verifying` 状态必须提供 manifest chain 和 PostgreSQL facts，缺失时不能进入 UAT。

## 负向证据

- manifest/evidence 字节篡改、不可变文件覆盖、supersede 断链/分叉/无根循环失败。
- evidence 符号链接/realpath 逃逸、0644、secret/PII key 失败。
- PostgreSQL 金额差 `0.01`、守恒自报与数据库不符失败；未使用 JavaScript Number 计算金额。
- approvedIgnored 缺 detached approval、非法 reason 或签署 hash 不等于实际字节 hash 失败。
- NULL 与 0 得到不同 canonical hash；target UUID、created_at、sequence 和 run id 改变不影响 canonical hash。
- 六类 owner 覆盖缺失、跨租户/园区、孤儿、source identity 和 legacy_record_map 错链失败。
- 锁定表集缺快照、未锁定或 allowlist 外 before/after hash 变化失败。

## 边界

本 Slice 只运行独立 PostgreSQL fixture，不读取真实玉舟 staging，不执行真实 A/B、真实 T4 或生产写。实际 T4 evidence 仍是 `not_started`，因此 full-domain lifecycle 的既有 pre-write gate 继续在任何 lab 写前阻断。`productionImport=HOLD` 未改变。

## 独立检查修复

- supersede 链除根、断链、分叉、循环和内容 hash 外，现强制状态只能保持或向状态机下一步推进，拒绝回退和跳跃。
- lab lifecycle 验证 chain 时重新读取 evidence root 下的实际 `0600` 字节；approvedIgnored 的 reason/hash 必须同时等于 PostgreSQL facts、manifest 字段和 `approved_ignored_attestation` evidence 的实际 SHA-256。
- PostgreSQL owner 检查同时要求 child/owner canonical row、tenant/park/source identity 和唯一 legacy map；重复 canonical/map 行失败。
- 保护表快照必须各有唯一 before/after、均声明锁定且 hash 为真实 SHA-256 格式；allowlist 仍受固定表名合同限制，不能加入 `sys_user` 等在线表自我放行。
- fixture lifecycle 明确停在 `verifying` 并返回 `FIXTURE_CANNOT_ENTER_UAT_READY`；只有真实 lab facts 可进入 `uat_ready`。
