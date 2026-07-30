## Bug Analysis: 000175 空库初始化依赖倒置

### 1. Root Cause Category

- **Category**: B/D/E - 跨阶段契约、集成测试缺口、隐式假设
- **Specific Cause**: `000175` 假定七个职责角色已经存在，但这些角色只由 migration
  之后才能执行的 production seed 创建。单文件审查没有暴露 migration → seed 的顺序冲突，
  既有验证也没有持续断言 000175 前置依赖。

### 2. Why Fixes Failed

1. 仅在 seed 中补齐角色只能保证 seed 后状态，无法让 seed 前的 migration 成功。
2. 直接修改 000175 会破坏已部署 migration 的 checksum，不适用于向前兼容修复。
3. 把完整 production seed 前移会混合迁移与初始化职责，并扩大权限和业务数据副作用。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | 为不可变历史 migration 提供 target-scoped prerequisite，独立 history/checksum/fail-fast | DONE |
| P0 | Test Coverage | release-smoke 空库迁移后断言两张表中的 prerequisite 均 succeeded | DONE |
| P0 | Regression | 固定 000175 SHA-256，并检查 prerequisite 最小写入边界与执行顺序 | DONE |
| P1 | Documentation | 在数据库初始化 spec、发布策略、部署和测试文档中记录机制与限制 | DONE |

### 4. Systematic Expansion

- **Similar Issues**: 其他数据 migration 若读取 seed 才创建的角色、字典或模块，也可能存在相同倒置。
- **Design Improvement**: 新 migration 依赖基线元数据时，应优先由更早 migration 创建；只有修复
  已成功发布且不可修改的历史 migration 时才使用 prerequisite。
- **Process Improvement**: release-smoke 必须保留“真正空库 migration → production seed”顺序，
  不能用预先 seed 的数据库替代。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/config/backend/database-initialization.md`。
- [x] 更新发布、部署和测试文档。
- [x] 增加静态回归测试与 release-smoke 双历史表断言。
- [x] 记录空库、重复迁移、旧环境兼容及失败状态机实跑证据。

本仓库没有 `src/templates/markdown/spec/` 模板树，因此无对应模板可同步。规范更新保留为当前
分支未提交变更，等待用户复核后统一提交。
