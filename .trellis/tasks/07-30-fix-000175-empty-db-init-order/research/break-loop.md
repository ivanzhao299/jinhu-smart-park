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
4. 初版自测只断言 migration 成功、角色存在和 seed 成功，没有断言早期 `JOIN sys_role`
   授权语句的影响行数或最终有效权限；PostgreSQL 对 0 行 `INSERT ... SELECT` 正常返回成功。
5. 初版双 history 测试只覆盖两表最终都为 succeeded 的稳定态，没有模拟两次独立提交之间
   的进程中断、状态/checksum 分歧和单边缺行。
6. `/users/me` 抽样沿用了 PR192 的民宿/住房角色范围，没有把本次新引入的七个核心角色及
   安全、工程权限纳入验收矩阵，属于验收范围与变更影响面不一致。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | 为不可变历史 migration 提供 target-scoped prerequisite，独立 history/checksum/fail-fast | DONE |
| P0 | Test Coverage | release-smoke 空库迁移后断言两张表中的 prerequisite 均 succeeded | DONE |
| P0 | Regression | 固定 000175 SHA-256，并检查 prerequisite 最小写入边界与执行顺序 | DONE |
| P0 | Architecture | 将角色 prerequisite 前移到首个依赖点 000064；部分初始化库在后续 pending 批次补跑 | DONE |
| P0 | Data Repair | 用参考库/候选库差集生成 458 条生产安全权限修复 seed | DONE |
| P0 | Atomicity | 双 history 单事务写入；bootstrap 后 status/checksum 冲突 fail-fast | DONE |
| P0 | Fault Injection | 覆盖状态分歧、checksum 分歧、单边缺行、普通/prerequisite 第二表写失败 | DONE |
| P0 | Effective RBAC | 空库五类角色关系差集归零，并以真实角色 `/users/me` 抽样安全/工程权限 | DONE |
| P1 | Documentation | 在数据库初始化 spec、发布策略、部署和测试文档中记录机制与限制 | DONE |

### 4. Systematic Expansion

- **Similar Issues**: 其他数据 migration 若读取 seed 才创建的角色、字典或模块，也可能存在相同倒置。
- **Design Improvement**: 新 migration 依赖基线元数据时，应优先由更早 migration 创建；只有修复
  已成功发布且不可修改的历史 migration 时才使用 prerequisite。
- **Process Improvement**: release-smoke 必须保留“真正空库 migration → production seed”顺序，
  不能用预先 seed 的数据库替代。
- **Review Checklist**: 数据初始化不能以“SQL 文件返回 0”作为业务成功；凡
  `INSERT ... SELECT ... JOIN` 依赖基线数据，都应验证影响行或最终关系矩阵。
- **Review Checklist**: 镜像表/双写表的测试必须包含冲突态与中断窗口，不能只比较 happy path
  最终计数。
- **Acceptance Scope**: 若修复引入或移动角色、权限、菜单、数据范围依赖，至少抽样一个真实
  低权限角色的投影接口，不能只复用邻近功能的管理员或无关角色测试。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/config/backend/database-initialization.md`。
- [x] 更新发布、部署和测试文档。
- [x] 增加静态回归测试与 release-smoke 双历史表断言。
- [x] 记录空库、重复迁移、旧环境兼容及失败状态机实跑证据。
- [x] 记录 504/458 权限差集、最终差集归零和真实 `/users/me` 抽样证据。
- [x] 将双 history 原子性与故障注入要求写入数据库初始化 spec。

本仓库没有 `src/templates/markdown/spec/` 模板树，因此无对应模板可同步。规范更新保留为当前
分支未提交变更，等待用户复核后统一提交。
