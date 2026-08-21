# 住房出租模块完整核查、UAT与修复闭环实施计划

## 0. 基线与规划

- [x] 冻结 GitHub Issue #336、`main` SHA、分支和干净 worktree。
- [x] 写入 PRD、设计和实施计划。
- [x] 建立需求—实现—测试追踪表并重新验证审计发现。
- [x] 读取 API/Web/Shared 相关 Trellis specs，激活任务。

## 1. 跨层访问合同

- [x] 核对并统一 Housing controller 的 `housing_rental + asset` 模块依赖。
- [x] 补 controller/manifest 契约测试和 UUID 参数边界。
- [x] 核对租客列表/创建、字段、文件、scope 与高风险 approval 合同。

验证：Housing controller/schema specs、property manifest specs、API typecheck/lint。

## 2. 前端闭环

- [x] 修复分页缩减收敛及回归测试。
- [x] 增加 empty-scope 授权引导。
- [x] 采购转收费改用 Remote Picker。
- [x] 为住房高风险申请补破坏性确认。
- [x] 抽取本次修改的 feature query owner，route-local 仅保留兼容导出。
- [x] 补状态、权限变化、候选失效和移动端回归。

验证：Housing Web tests、web typecheck、目标 lint、build。

## 3. API/数据库/UAT Gate

- [x] 运行 Housing API 单测和 shared tests；PG 行为由隔离真实 API E2E 覆盖。
- [x] 启动隔离 PostgreSQL/API/Web，执行 migration、seed、bootstrap 和 property fixture。
- [x] 执行 property API E2E housing suite，归档报告并验证 residual=0。
- [x] 执行 desktop 1440×1000 与 mobile 390×844 浏览器 UAT。
- [x] 记录权限负向、文件、409、审批、键盘/reflow 和 console/network 结果。

## 4. 证据与文档

- [x] 更新住房专项证据，区分自动化浏览器和真人 UAT。
- [x] 更新 Issue #336 追踪矩阵与验证代码候选 SHA。
- [x] 更新相关 Trellis 状态漂移，但不伪造既有任务完成时间或签署。
- [x] 准备 PR192 真人 UAT handoff。

## 5. GitHub PR 闭环

- [x] 检查 diff，只暂存本任务文件。
- [x] 运行风险匹配验证与 `git diff --check`。
- [x] 提交并推送分支。
- [x] 创建一个 draft PR，关联 `Fixes #336`。
- [x] 每次推送后评论 `@codex review`。
- [x] 循环处理当前 head 的有效 review 与 CI 失败。
- [x] CI 全绿、最新复审无重大问题后转 ready 并合并。

## 6. 合并后闭环

- [x] 跟进 `main` CI 与 Release Smoke。
- [x] 跟进 Deploy Production、健康检查和公开生产校验。
- [x] 确认 post-deploy Docker cleanup 成功。
- [x] 更新 Issue/PR/Trellis 最终状态。
- [x] 真人 UAT/签署未完成时保持 `awaiting_human_gate` 并报告最小下一步。

## 7. 最终同步结果

- Issue #336 已关闭；PR #337 已合并。
- PR head：`60f2b6e8c1e938e5a5d1191836f8d177ce9dbb62`。
- main merge SHA：`ed8cfd2450c6320e6e0be7dfc773db698d4c9303`。
- PR head CI/Release Smoke：GitHub Actions run `32395805698` 成功。
- main CI/Release Smoke：GitHub Actions run `32398415997` 成功。
- Deploy Production：GitHub Actions run `32398416019` 成功，包含健康检查、公开生产保护账号校验、Release Smoke 和部署后 Docker cleanup。
- 最新 Codex review 结论：`Didn't find any major issues.`
- PR192 真人 UAT、具名签署与住房生产启用仍保持 `awaiting_human_gate`；本任务未启用住房生产开关。

## 风险与停止条件

- 发现跨租户/园区、敏感文件、财务重复/丢失、maker-checker 绕过时立即按 P0 停止合并。
- 发现 migration checksum/history 冲突时停止 seed、bootstrap、部署和后续测试。
- 未获得真人签署时不启用住房生产模块或高风险生产开关。
- 不修改、不暂存当前主工作区或其他任务的文件。
