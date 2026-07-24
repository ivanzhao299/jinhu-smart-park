# JinHu Smart Park 文档索引

本索引用于整理仓库内正式文档入口，帮助新人、开发、测试、运维和发布负责人快速定位材料。

## 0. 当前权威口径

- [当前产品范围与分批开放策略](product/current-product-scope.md)
- [环境矩阵](deployment/environment-matrix.md)
- [全量产品 UAT 验收矩阵](uat/full-product-acceptance-matrix.md)

当前项目仍处于开发完善和 UAT 阶段，尚未真实投入生产。全部已设计开发功能均属于计划上线范围，允许分批 UAT 和分批正式开放。历史“首发/二期/生产开放”材料继续作为阶段性证据，不覆盖以上当前口径。

## 1. 新人接手

- 项目总入口：[README.md](../README.md)
- 当前产品范围：[product/current-product-scope.md](product/current-product-scope.md)
- 环境矩阵：[deployment/environment-matrix.md](deployment/environment-matrix.md)
- 全量 UAT 矩阵：[uat/full-product-acceptance-matrix.md](uat/full-product-acceptance-matrix.md)
- 当前移交清单：[handover/smart-park-handover-checklist.md](handover/smart-park-handover-checklist.md)
- 测试运行入口：[testing/how-to-run-tests.md](testing/how-to-run-tests.md)
- 首发回归设计：[testing/first-release-regression-plan.md](testing/first-release-regression-plan.md)
- 生产级部署入口（当前用于 UAT）：[deployment/production.md](deployment/production.md)
- 未来生产就绪矩阵：[release/production-readiness-matrix.md](release/production-readiness-matrix.md)

## 2. 开发与本地运行

- 环境变量模板：仓库根目录 `.env.example`、`.env.production.example`
- 数据库初始化与 UAT/未来 Production 基线：[deployment/production.md](deployment/production.md)
- 生产 migration 执行策略：[release/production-migration-execution-policy.md](release/production-migration-execution-policy.md)
- 本地开发细节：当前以 `README.md` 和现有脚本为入口，模块边界专项文档待后续补充

## 3. 测试与回归

- 测试运行手册：[testing/how-to-run-tests.md](testing/how-to-run-tests.md)
- 全量产品 UAT 状态：[uat/full-product-acceptance-matrix.md](uat/full-product-acceptance-matrix.md)
- 未来生产验收矩阵与风险清单：[release/production-readiness-matrix.md](release/production-readiness-matrix.md)
- 首发核心回归设计：[testing/first-release-regression-plan.md](testing/first-release-regression-plan.md)
- 接口快照与查询响应对照设计：[testing/api-snapshot-regression-plan.md](testing/api-snapshot-regression-plan.md)
- 接口快照脚本初版收口复核：[testing/api-snapshot-initial-closure-review.md](testing/api-snapshot-initial-closure-review.md)
- 接口快照 Baseline 维护规则：[testing/api-snapshot-baseline-policy.md](testing/api-snapshot-baseline-policy.md)
- 接口快照小范围扩展设计：[testing/api-snapshot-small-expansion-plan.md](testing/api-snapshot-small-expansion-plan.md)
- 接口快照工单扩展收口复核：[testing/api-snapshot-workorder-extra-closure-review.md](testing/api-snapshot-workorder-extra-closure-review.md)
- 接口快照数据稳定性策略设计：[testing/api-snapshot-data-stability-plan.md](testing/api-snapshot-data-stability-plan.md)
- 接口快照固定业务标识机制设计：[testing/api-snapshot-business-key-plan.md](testing/api-snapshot-business-key-plan.md)
- 接口快照固定业务标识机制收口复核：[testing/api-snapshot-business-key-closure-review.md](testing/api-snapshot-business-key-closure-review.md)
- 接口快照固定测试数据设计：[testing/api-snapshot-fixed-data-plan.md](testing/api-snapshot-fixed-data-plan.md)
- 接口快照 Bootstrap 设计与实施状态：[testing/api-snapshot-bootstrap-plan.md](testing/api-snapshot-bootstrap-plan.md)
- 接口快照 Bootstrap 收口复核：[testing/api-snapshot-bootstrap-closure-review.md](testing/api-snapshot-bootstrap-closure-review.md)
- 接口快照固定样本 Baseline 收口复核：[testing/api-snapshot-fixed-baseline-closure-review.md](testing/api-snapshot-fixed-baseline-closure-review.md)
- 接口快照 list / stats 波动治理设计：[testing/api-snapshot-list-stats-stability-plan.md](testing/api-snapshot-list-stats-stability-plan.md)
- workorders.list 快照降级收口复核：[testing/api-snapshot-workorders-list-closure-review.md](testing/api-snapshot-workorders-list-closure-review.md)
- workorders.stats 快照拆分策略设计：[testing/api-snapshot-workorders-stats-split-plan.md](testing/api-snapshot-workorders-stats-split-plan.md)
- workorders.stats schema snapshot 收口复核：[testing/api-snapshot-workorders-stats-schema-closure-review.md](testing/api-snapshot-workorders-stats-schema-closure-review.md)
- workorders.stats numeric 专项模式设计：[testing/api-snapshot-workorders-stats-numeric-plan.md](testing/api-snapshot-workorders-stats-numeric-plan.md)
- workorders.stats numeric 模式脚本能力收口复核：[testing/api-snapshot-workorders-stats-numeric-mode-closure-review.md](testing/api-snapshot-workorders-stats-numeric-mode-closure-review.md)
- workorders.stats numeric baseline 建立门禁：[testing/api-snapshot-workorders-stats-numeric-baseline-gate.md](testing/api-snapshot-workorders-stats-numeric-baseline-gate.md)
- workorders.stats numeric baseline 建立审查：[testing/api-snapshot-workorders-stats-numeric-baseline-review.md](testing/api-snapshot-workorders-stats-numeric-baseline-review.md)
- workorders.stats numeric baseline 收口复核：[testing/api-snapshot-workorders-stats-numeric-baseline-closure-review.md](testing/api-snapshot-workorders-stats-numeric-baseline-closure-review.md)
- workorders.stats numeric manual workflow 评估：[testing/api-snapshot-workorders-stats-numeric-manual-workflow-plan.md](testing/api-snapshot-workorders-stats-numeric-manual-workflow-plan.md)
- workorders.stats numeric manual workflow 评估收口复核：[testing/api-snapshot-workorders-stats-numeric-manual-workflow-closure-review.md](testing/api-snapshot-workorders-stats-numeric-manual-workflow-closure-review.md)
- workorders.stats numeric manual workflow 设计：[testing/api-snapshot-workorders-stats-numeric-manual-workflow-design.md](testing/api-snapshot-workorders-stats-numeric-manual-workflow-design.md)
- workorders.stats numeric manual workflow 设计收口复核：[testing/api-snapshot-workorders-stats-numeric-manual-workflow-design-closure-review.md](testing/api-snapshot-workorders-stats-numeric-manual-workflow-design-closure-review.md)
- workorders.stats numeric manual workflow 小实现：[../.github/workflows/api-snapshot-numeric.yml](../.github/workflows/api-snapshot-numeric.yml)
- workorders.stats numeric manual workflow 运行手册：[testing/api-snapshot-workorders-stats-numeric-manual-workflow-runbook.md](testing/api-snapshot-workorders-stats-numeric-manual-workflow-runbook.md)
- workorders.stats numeric baseline / manual workflow 阶段性总结：[testing/api-snapshot-workorders-stats-numeric-baseline-workflow-summary.md](testing/api-snapshot-workorders-stats-numeric-baseline-workflow-summary.md)
- first release API snapshot / release gate 总复盘：[testing/first-release-api-snapshot-release-gate-review.md](testing/first-release-api-snapshot-release-gate-review.md)
- snapshot bootstrap 固定关联实施收口复核：[testing/api-snapshot-bootstrap-association-closure-review.md](testing/api-snapshot-bootstrap-association-closure-review.md)
- fresh 隔离库默认 schema baseline 对齐设计：[testing/api-snapshot-fresh-schema-baseline-alignment-plan.md](testing/api-snapshot-fresh-schema-baseline-alignment-plan.md)
- fresh schema baseline 对齐审查：[testing/api-snapshot-fresh-schema-baseline-alignment-review.md](testing/api-snapshot-fresh-schema-baseline-alignment-review.md)
- fresh schema baseline 对齐收口复核：[testing/api-snapshot-fresh-schema-baseline-closure-review.md](testing/api-snapshot-fresh-schema-baseline-closure-review.md)
- 测试总览旧文档：[testing/README.md](testing/README.md)
- 现有阶段性测试材料：
  - [testing/files-center-test-plan.md](testing/files-center-test-plan.md)
  - [testing/s1-governance-hardening.md](testing/s1-governance-hardening.md)
  - [testing/s1-self-test.md](testing/s1-self-test.md)

当前核心回归入口仍保留历史 `first-release` 命名：

```bash
node scripts/e2e/first-release-regression.mjs
```

## 4. 部署与运维

- 环境矩阵：[deployment/environment-matrix.md](deployment/environment-matrix.md)
- 生产级部署说明（当前用于 UAT）：[deployment/production.md](deployment/production.md)
- 部署版本追溯：见 [deployment/production.md](deployment/production.md) 的 Deployment Traceability 小节
- 运维排障手册：[deployment/troubleshooting.md](deployment/troubleshooting.md)

## 5. 发布与回滚

以下材料多数形成于历史首发、production-like UAT 或未来生产准备阶段。阅读时应结合 [当前产品范围](product/current-product-scope.md) 和 [环境矩阵](deployment/environment-matrix.md)，不能仅凭文件名判断系统已经真实生产投运。

- [First Release Readiness 总清单](release/first-release-readiness-checklist.md)
- [First Release Readiness 差距分析](release/first-release-readiness-gap-analysis.md)
- [First Release Target Environment Verification Plan](release/first-release-target-environment-verification-plan.md)
- [First Release Target Environment Verification Dry-run](release/first-release-target-environment-verification-dry-run.md)
- [First Release Target Environment Verification Execution Record](release/first-release-target-environment-verification-execution-record.md)
- [Safety Module Full-open Phase 1 Record](release/safety-module-full-open-phase-1-record.md)
- [Safety Module Full-open Phase 2 Access Smoke Record](release/safety-module-full-open-phase-2-access-smoke-record.md)
- [Safety Module Full-open Release Acceptance Summary](release/safety-module-full-open-release-acceptance-summary.md)
- [生产上线 SOP](release/production-release-sop.md)
- [生产验收矩阵与风险清单](release/production-readiness-matrix.md)
- [生产回滚 SOP](release/production-rollback-sop.md)
- [Go-Live Checklist](release/production-go-live-checklist.md)
- [Go-Live Readiness](release/production-go-live-readiness.md)
- [生产发布参数检查清单](release/production-release-params-checklist.md)
- [生产 Migration 执行策略](release/production-migration-execution-policy.md)
- [Migration history/checksum 设计](release/migration-history-checksum-design.md)
- [预发布验收报告](release/pre-release-acceptance-report.md)
- [Final Go 验证](release/pre-release-final-go-validation.md)

## 6. 架构与治理

- [仓库二次质量复审报告](release/repository-quality-audit-report.md)
- [首发核心自动化回归包设计](testing/first-release-regression-plan.md)
- [Migration history/checksum 设计](release/migration-history-checksum-design.md)
- [大页面 / 大服务拆分设计](release/large-page-service-refactor-plan.md)
- [阶段五-F 重构治理总结报告](release/stage-5f-refactor-summary.md)
- [后端纯查询 Service 拆分设计](release/backend-query-service-refactor-plan.md)
- [房源查询 Service 拆分收口复核](release/units-query-service-closure-review.md)
- [工单查询 Service 拆分设计](release/workorder-query-service-refactor-plan.md)
- [工单查询 Service 拆分收口复核](release/workorder-query-service-closure-review.md)
- [工单查询 Service 第二刀设计](release/workorder-query-service-second-cut-plan.md)
- [工单查询 Service 第二刀 2A 收口复核](release/workorder-query-service-2a-closure-review.md)
- [工单查询 Service 第二刀 2B stats 设计](release/workorder-query-service-stats-plan.md)
- [工单查询 Service 第二刀 2B stats 收口复核](release/workorder-query-service-stats-closure-review.md)
- [工单 Query Service 阶段性总结](release/workorder-query-service-stage-summary.md)
- [资产房源页面拆分收口复核](release/assets-units-refactor-closure-review.md)
- [工单列表页面拆分收口复核](release/workorders-list-refactor-closure-review.md)
- 架构专项资料：
  - [architecture/auth-center-roadmap.md](architecture/auth-center-roadmap.md)
  - [architecture/saas-rbac-std.md](architecture/saas-rbac-std.md)
  - [architecture/supplement-integration.md](architecture/supplement-integration.md)

## 7. Handover 资料

- 当前移交清单：[handover/smart-park-handover-checklist.md](handover/smart-park-handover-checklist.md)
- 移交清单 drift 审计报告：[handover/smart-park-handover-checklist-drift-report.md](handover/smart-park-handover-checklist-drift-report.md)

早期 handover、阶段性审查和上线签字模板等材料如仍位于仓库外项目交接目录中，应以当前仓库内清单和本索引为准。

当前仓库内的正式文档入口以 [README.md](../README.md) 和本索引为准。
