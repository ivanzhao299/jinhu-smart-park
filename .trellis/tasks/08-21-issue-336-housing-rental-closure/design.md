# 住房出租模块完整核查、UAT与修复闭环技术设计

## 1. 交付边界

本任务使用一个干净 worktree、一个 GitHub Issue、一个集成分支和一个 draft PR。实现按风险闭包串行推进，避免同时维护两套住房入口或在多个 PR 间制造未完成状态。

技术完成与生产启用分离：代码可以在功能开关/模块未启用状态下部署，但住房 `production_ready` 仍依赖既有 PR192 真人 UAT、具名签署和 rollout approval。

## 2. 权威合同

- 产品与状态：PR192 remediation、human UAT readiness、住房 workbench 和后续 #244/#251/#271/#272/#273。
- 访问合同：`packages/shared/src/property-business/**`。
- API：`apps/api/src/modules/housing/**` 及 property approval/file/unit access 依赖。
- Web：`apps/web/app/housing/**` 与 `apps/web/features/property-shared/**`。
- 数据库：住房、共享房产、审批、owner-scope 迁移。
- 发布：`.github/workflows/ci.yml`、property API E2E gate、production deploy/health/cleanup。

## 3. 修复闭包

### 3.1 跨层模块依赖

以 Shared manifest 的 `required: housing_rental, dependencies: [asset]` 为真源。Housing controller 中所有依赖房源、占用、租约、交割、报修、财务和采购的入口统一要求 `housing_rental + asset`。新增合同测试枚举端点，避免未来只修部分路由。

### 3.2 前端列表与状态

列表 API 返回页码超过新总页数时，客户端将 URL 收敛到最后有效页并重新请求，不显示 `2/1`。收敛必须有循环保护，不在 loading/权限变化时误跳转。

empty-scope 不直接扩大权限；只在具备相应资产/用户管理页面权限时提供跳转，否则显示联系管理员说明。

### 3.3 实体选择与危险确认

采购转收费复用住房授权租约候选查询与 `RemoteEntityPicker`，选择值包含稳定 ID 和服务端授权 label。提交前重新确认当前权限 fingerprint 和候选仍有效。

高风险表单使用共享 dialog/confirm surface，显示不可变业务身份、目标状态、影响和必填原因；确认操作只提交 approval request。

### 3.4 Feature 分层

不为目录验收进行一次性大搬迁。先抽取 contracts/api/query/mutation 中本次会修改且可单一所有权的逻辑到 `apps/web/features/housing`，原 route component 只消费新 owner；同一提交删除旧实现。其余组件在有行为测试保护时渐进迁移，并在追踪矩阵记录未迁移但不影响行为的 P2 债务。

## 4. UAT 架构

使用 disposable PostgreSQL、正式 migration/production-safe seed/bootstrap 顺序、专项 property fixture 和真实 Nest/Web。fixture 必须显式隔离标记、唯一 run ID、事务边界和 cleanup。

浏览器 UAT 使用独立 Profile，desktop/390px 对同一 candidate SHA 执行。自动化浏览器只证明技术行为，不替代真人岗位样本和签署。

## 5. Review 与发布状态机

```text
local planned -> implemented -> locally_verified
PR draft -> CI/review loop -> ready -> merged
main -> CI + deploy -> health + release smoke + cleanup
technical_closed -> awaiting_human_gate -> production_ready
```

每次推送后触发最新提交 Codex review。旧线程只有在最新复审明确覆盖对应 commit 且代码已核验时才可视为过期。

## 6. 回滚

- Web/API 修复可按提交回退；不删除历史审批或财务数据。
- 数据库只允许 expand/forward fix。
- 高风险执行始终保持 approval adapter，不回退为直接 mutation。
- 部署失败使用仓库现有 production rollback/health 流程；部署后必须执行 Docker cleanup。
