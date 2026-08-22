# 技术设计

## 总体结构

本任务作为交付编排父任务，不直接承载所有代码。五个子任务分别拥有数据库、权限验证、前端增量、自动化门禁、UAT/readiness 证据；共同消费现有 property access manifest、PR #263 岗位权限合同、PR192 UAT 状态机和生产部署 runbook。

## 依赖顺序

1. 同步并确认 PR #263 已进入实施基线。
2. 数据库 owner FK 与权限字段策略可并行实现。
3. 前端只消费已稳定的 API/permission/task-source 合同。
4. 自动化门禁在前三项接口冻结后收敛。
5. 目标 UAT 使用同一候选 commit；通过后才进入发布 readiness 和部署。

## 数据库设计

- 对每张遗留表先执行只读 preflight；发现跨 owner 历史数据时 fail-fast，不自动搬迁或删除。
- 为父表建立所需复合 unique，再删除明确命名的裸 FK，新增 `NOT VALID` 复合 FK、执行 `VALIDATE CONSTRAINT`，保证升级窗口可审计。
- migration/seed 职责分离；migration 不创建业务角色或测试数据。

## 权限与字段设计

- `PROPERTY_ACCESS_MANIFEST` 和 PR #263 role templates 是唯一权限定义来源。
- API 先执行 tenant/park/unit 数据范围，再执行字段策略；硬编码的身份证、凭证等安全下限不能被宽松策略放开。
- Web field projection 仅用于展示 UX，不替代 API 保护。

## 前端设计

- 不重构已完成工作台。修复必须有 API/manifest/真实 UAT 证据。
- PropertyRuntimeSlots source type 从共享合同生成或有契约测试，避免字符串漂移。
- 高风险动作逐项执行 readiness matrix：审批、权限、幂等、审计、终态约束全部通过才接入 UI；任何开放动作必须补 409、重放、越权、跨园区和终态回归。未通过的动作保持 fail-closed 并记录后续范围。

## 测试与发布设计

- API E2E 使用隔离 PostgreSQL、正式迁移/production-safe seed、真实 Nest HTTP 和可识别 fixture；结束时清理并验证 residual=0。
- CI 快速门与手动 release 深门分层，避免每个普通提交启动昂贵全链路环境。
- UAT 证据必须记录 commit、环境、角色、viewport、步骤、结果、截图/接口证据和清理结果。
- 部署复用现有 workflow，必须在健康检查后执行 Docker cleanup。

## 回滚边界

- 数据库仅 forward fix；出现历史数据冲突时停止迁移，先建独立数据修复任务。
- 前端/API 可通过正常 PR revert 回滚，但不得回退已应用迁移。
- 部署失败按现有 release marker/rollback runbook 执行，不人工绕过门禁。
