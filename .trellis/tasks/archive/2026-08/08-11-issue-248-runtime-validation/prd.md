# 验证 Issue 248 数据库迁移与完整 E2E

## Goal

在隔离的本地 PostgreSQL 与 API 环境中实跑 Issue #248 的完整迁移、组织层级 E2E 和首发完整回归，发现缺陷时修复并重新验证。

## Requirements

- 不连接生产、UAT 或现有本地数据库卷。
- 使用独立容器、端口、数据库卷和文件存储目录。
- 按迁移、开发种子、API、定向 E2E、完整回归的顺序执行。
- 保留完整命令结果并报告环境性跳过或残留风险。

## Acceptance Criteria

- [x] 空库迁移执行至 `000202_org_hierarchy_integrity.sql` 成功，双历史表一致。
- [x] 000202 新增索引和复合父级外键存在。
- [x] API 启动并通过 health/ready。
- [x] `first-release-org-hierarchy.mjs` 通过。
- [x] `first-release-regression.mjs` 通过，或所有失败均完成修复与复跑。
- [x] 隔离服务安全停止，明确隔离卷和测试文件处理结果。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
