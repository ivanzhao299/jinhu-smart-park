# 共享房产底座专项验证证据

> 执行日期：2026-07-24
> 执行分支：`codex/shared-property-foundation`
> 证据状态：开发验证通过，UAT API 验收待执行

## 1. 覆盖范围

- 共享房源经营模式：`none`、`short_stay`、`long_rent`。
- 统一占用期间：`[start, end)`。
- 同一租户、园区、整套房源的有效占用互斥。
- 民宿、住房出租、商业租赁、维护和运营占用共用冲突口径。
- 短租经营模式阻止商业租赁合同绑定。
- 共享占用与既有商业租赁合同双向互斥。
- 相邻占用期间允许衔接。
- 非法期间和数据库冲突使用稳定错误语义。

## 2. 自动化验证

| 验证项 | 命令/入口 | 结果 |
|---|---|---|
| Shared TypeScript 构建 | `tsc -p packages/shared/tsconfig.json` | PASS |
| API 类型检查 | `tsc -p apps/api/tsconfig.json --noEmit` | PASS |
| API 构建 | `tsc -p apps/api/tsconfig.json` | PASS |
| 目标模块 lint | 本地 ESLint，覆盖 property-operations、leasing、unit、filter、audit、app | PASS |
| 目标单元测试 | 编译后执行 4 个 spec，共 9 个测试 | 9 PASS / 0 FAIL |
| SQL 约束回归 | [`scripts/e2e/shared-property-foundation.sql`](../../scripts/e2e/shared-property-foundation.sql) | PASS，事务末尾回滚 |

单元测试覆盖：

- `[start, end)` 交叠与相邻边界。
- 经营模式与占用来源兼容策略。
- 身份证件号码加密、哈希、掩码和密钥稳定性。
- `000176` 关键表、约束、触发器和权限结构。
- PostgreSQL `23P01` 到 HTTP 409 的冲突翻译。

## 3. PostgreSQL 迁移与并发证据

验证环境：

- 一次性 `postgres:16-alpine` 容器。
- 未挂载项目现有数据库卷。
- 数据库迁移从 `000001` 执行至 `000174`，随后单独应用 `000176`。
- `000176_shared_property_foundation.sql` 执行成功。

仓库既有 `000175_2026_responsibility_user_role_queue.sql` 在全新空库缺少预置责任角色时会主动失败；该前置条件与 `000176` 无关，但正式 UAT 迁移仍需按现有生产初始化流程复核。

并发场景：

1. 会话 A 为同一整套房源写入 `2026-10-01` 至 `2026-10-03` 的民宿占用，并在事务中保持 2 秒。
2. 会话 B 并发写入 `2026-10-02` 至 `2026-10-04` 的住房出租占用。
3. 会话 A 提交成功。
4. 会话 B 收到 `ex_property_occupancy_active_period` 排他约束冲突。
5. 最终有效占用数量为 `1`。

结果：PASS。同一房源的重叠长短租请求在数据库层只能成功一个，不依赖应用层先查后写。

## 4. 尚待 UAT 验收

- 在目标 UAT 数据库按正式迁移脚本和初始化流程执行 `000176`。
- 使用真实租户、园区、楼栋、楼层和房源验证数据范围。
- 验证经营模式切换权限、占用增删改权限和敏感身份字段权限。
- 验证 Idempotency-Key 重放、冲突和审计日志。
- 通过 UAT API 验证商业合同、共享占用和模式切换的完整业务闭环。
- 记录 UAT commit、环境标识、执行人、截图或接口结果及测试数据清理结果。
