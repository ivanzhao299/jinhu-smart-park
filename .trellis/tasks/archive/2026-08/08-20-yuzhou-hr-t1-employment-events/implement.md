# 实施计划

## 1. 源数据审计与稳定抽取

- [x] 查询类型/状态/空值/重复/员工孤儿/日期范围聚合，不输出敏感明细。
- [x] 新增 T1 抽取与转换工具，固定显式列、排序、hash 和脱敏错误协议。
- [x] 连续两次抽取并比较规范输出 hash。

## 2. 目标模型

- [x] 实施前重扫迁移编号，新增前向迁移扩展历史事件兼容字段和约束。
- [x] 同步 TypeORM entity 和 contract test；不改变在线状态机行为。

## 3. 装载、核对与回滚

- [x] 新增 T1 loader，复用 T0 target/run/mutation/checksum 门禁。
- [x] 写事件、record map、错误、检查和 rollback point。
- [x] 冻结并验证员工当前态 hash；运行 load → verify → rollback → reload。
- [x] 验证同 run 拒绝、source drift 拒绝和失败无部分业务数据。

## 4. 质量与交付

- [x] 运行脚本语法和 Node contract 测试。
- [x] 在隔离 PostgreSQL 执行完整迁移、production-safe seed 和 T1 集成（复用已完成 production-safe seed 的 T0 目标库，完整迁移链增至 224）。
- [x] 运行 API HR contract、workspace lint/typecheck/build。
- [x] 扫描日志/报告敏感信息，验证临时资源可清理。
- [x] 更新 HR spec、父任务进度和迁移摘要，提交独立 commit。

## 回滚点

- 数据模型只使用前向迁移，不反向改已成功 migration。
- 业务数据回滚只按 `(batch_id, target_table='hr_employment_event', active map)` 删除。
- 抽取/staging 失败时不触碰 PostgreSQL；装载事务失败时不继续 seed、API 或后续领域。
