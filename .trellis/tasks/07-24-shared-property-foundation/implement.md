# 共享房产底座实施计划

## 1. 实施步骤

- [x] 确认 `asset_*` 与 `biz_*` 当前数据映射和 API 使用面。
- [x] 定义共享枚举、响应类型和权限常量。
- [x] 设计新的前向迁移编号，避开历史重复 `000136`。
- [x] 实现经营配置和模式切换日志。
- [x] 实现统一占用账本、事务和冲突语义。
- [x] 实现个人业务相对方及敏感字段策略。
- [x] 为现有商业合同增加占用兼容适配。
- [x] 增加 API、权限、菜单/模块声明和审计。
- [ ] 增加单元测试、并发测试和目标 E2E。
- [x] 更新领域蓝图、迁移说明和 UAT 矩阵。

当前验证进度：

- [x] 共享契约与 API TypeScript 检查。
- [x] 目标模块 lint。
- [x] `[start, end)`、经营模式兼容、敏感信息加密和迁移结构单元测试。
- [x] 在可用 PostgreSQL 环境执行迁移与 GiST 并发占用测试。
- [ ] 在 UAT API 执行权限、租户/项目隔离和商业合同兼容 E2E。

## 2. 风险文件

- `apps/api/src/modules/units/**`
- `apps/api/src/modules/assets/**`
- `apps/api/src/modules/leasing-contracts/**`
- `packages/shared/src/index.ts`
- `database/migrations/**`
- production seed 和权限基线

## 3. 回滚

- 使用新迁移和独立表，避免破坏现有字段。
- 新能力由模块授权和功能开关控制。
- 初期商业合同使用读取适配器，可在不迁移历史数据的情况下回退。
- 不删除现有 `asset_*` 或 `biz_*` 数据。

## 4. 验证命令

- API 单元测试和目标模块 typecheck/lint/build。
- 新迁移在全新库和已有 UAT 快照副本上验证。
- 并发占用专项脚本。
- 现有资产、合同、应收和全量回归。
