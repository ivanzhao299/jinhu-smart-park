# Phase 16：部署回滚诱发 migration alias 双身份

## 1. Root Cause Category

- **Category**: B/D/E — 跨层合同、集成测试缺口与隐式假设。
- **Specific Cause**: migration runner 正确处理了 legacy-only 文件名重签，却假定源码回滚不会再运行旧
  migration manifest。PR #223 先重签 `000183` 为 `000199`，再于更晚 migration 失败；workflow 随后
  使用旧源码执行 `prod:deploy`，把相同 SQL 以 `000183` 再次记录为 succeeded，形成双身份。

## 2. Why Previous Fix Was Incomplete

1. alias contract 只回放 legacy-only，未覆盖“重签成功、后续 migration 失败、旧源码 rollback”组合路径。
2. 双身份一律 fail closed 能防止静默误合并，但没有识别既有 alias marker 可证明的精确重复。
3. 源码 rollback 被当作应用层操作，却通过 `prod:deploy` 隐式再次进入数据库迁移层。

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Runtime | 仅在双表 legacy/canonical/marker 均 succeeded 且 checksum 精确一致时事务折叠旧身份 | DONE |
| P0 | Architecture | 源码 rollback 直接重建容器，不运行旧 migration/seed manifest | DONE |
| P0 | Integration test | Release Smoke 回放 legacy-only、checksum 漂移双身份与精确双身份 | DONE |
| P0 | Audit integrity | 双表已存在时 bootstrap 不补缺；缺 legacy/marker 保留给 FULL JOIN 拒绝 | DONE |
| P1 | Documentation | 同步 production runbook、migration policy 与 Trellis operations guide | DONE |

## 4. Systematic Expansion

- **Similar Issues**: 任何未来 migration rename 都可能在“前向迁移部分成功 + 源码回滚”后形成同类碰撞。
- **Design Improvement**: source rollback 与 database recovery 必须是两个显式流程；前者不得反向消费旧清单。
- **Process Improvement**: migration alias 的 Release Smoke 必须同时覆盖单身份重签、可证明重复收敛和漂移拒绝。

## 5. Knowledge Capture

- [x] 更新 `.trellis/spec/guides/project-operations.md`。
- [x] 更新生产部署文档与 migration execution policy。
- [x] 更新任务实施记录和真实 PostgreSQL 回放证据。
- [x] 项目不存在 `src/templates/markdown/spec/` 镜像目录，无模板可同步。
