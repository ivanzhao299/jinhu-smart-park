# 全量产品 UAT 验收矩阵

> 初始化日期：2026-07-24
> 本矩阵采用保守状态：历史 PASS 作为可复用证据，但在绑定当前 commit 和当前 UAT 环境重新复核前，不自动标记为当前版本 `uat_passed`。

## 1. 使用规则

- 所有已设计开发模块都属于目标上线范围。
- UAT 与目标范围分离：未通过 UAT 不代表模块被移出产品范围。
- 每次状态更新必须记录 commit、环境、执行时间、负责人和证据链接。
- 跨模块流程需同时满足上游、下游、权限、数据范围和财务/审计要求。
- 当前没有任何模块可标记为 `production_enabled`，因为真实 Production 尚未启用。

状态定义见 [当前产品范围](../product/current-product-scope.md)。

## 2. 当前矩阵

| 领域 | 核心验收范围 | 开发现状 | 当前 UAT 状态 | 正式生产 | 主要证据/下一步 |
|---|---|---|---|---|---|
| SaaS/系统治理 | 租户、组织、用户、角色、权限、模块、数据范围、字段策略、字典、编码 | 已实现并持续完善 | `uat_pending` | 未启用 | S1、RBAC、菜单与角色专项回归 |
| 认证与会话安全 | 密码登录、刷新 Cookie、限流、锁定、上下文、退出、审计 | 已实现并持续加固 | `uat_pending` | 未启用 | release-smoke、auth health、安全专项 |
| 资产与空间 | 园区、楼栋、楼层、房源、状态、统计、图片、平面图 | 已实现 | `uat_pending` | 未启用 | `s2b`、资产 Gate 历史证据，需当前版本复核 |
| 招商与企业客户 | 线索、跟进、看房、报价、公海池、漏斗、企业租户 360 | 已实现 | `uat_pending` | 未启用 | `s3a/s3b` 和招商角色流程 |
| 合同生命周期 | 草稿、审批、生效、房源、变更、续租、退租、归档 | 已实现 | `uat_pending` | 未启用 | `s3c/s3e`、合同生命周期 Gate |
| 租赁财务 | 应收、收款、核销、账龄、减免、发票、退款、财务审计 | 已实现 | `uat_pending` | 未启用 | `s3d` 系列、财务 Gate、幂等专项 |
| 工单与工作流 | 创建、派单、处理、确认、评价、SLA、收件箱 | 已实现 | `uat_pending` | 未启用 | 工单 smoke、角色业务闭环 |
| 文件与审计 | 上传、附件、预览、下载、绑定、操作/登录日志 | 已实现 | `uat_pending` | 未启用 | files 回归、字段/文件策略 Gate |
| 安全巡检与隐患 | 点位、模板、计划、任务、现场执行、隐患、整改、统计 | 已实现 | `uat_pending` | 未启用 | `s5a`、安全历史 Gate、移动端 UAT |
| 应急与作业许可 | 联系人、预案、事件、处置、作业许可 | 已实现 | `uat_pending` | 未启用 | `s5b` 和专项生产相似 Gate |
| 工程管理 | 项目、计划、日报、巡检、整改、验收、移动终端 | 已实现并持续完善 | `uat_pending` | 未启用 | `docs/uat/engineering-*` 历史 PASS，需当前版本复核 |
| IoT | 网关、设备、指标、实时状态、告警、规则、场景 | 已实现 | `uat_pending` | 未启用 | `s9a-s9d1` 系列 smoke |
| 能源 | 表计、读数、告警、账期、账单、分摊、调整/红冲 | 已实现 | `uat_pending` | 未启用 | `s9e/s9f/s9f1` 和能源 Gate |
| 视频安防 | 摄像头、平台、预览、告警、证据 | 已实现 | `uat_pending` | 未启用 | `s8c-s8f` 系列 smoke |
| 机器人 | 总览、清洁机器人、任务与运营治理 | 已实现并持续完善 | `uat_pending` | 未启用 | 机器人专项 UAT/设备证据待补 |
| 驾驶舱与分析 | 管理、资产、招商、财务、工单、安全、IoT、能源 | 已实现并持续校准 | `uat_pending` | 未启用 | 驾驶舱准确性 Gate、数据口径复核 |
| 租户服务与移动终端 | 租户服务入口、现场巡检/工单/工程操作 | 已实现并持续完善 | `uat_pending` | 未启用 | 浏览器、角色、表单和移动端 UAT |
| AI 工作编排 | 自然语言计划、批准、工单生成、重复保护、流程收件箱 | MVP 已实现 | `uat_pending` | 未启用 | AI work orchestration UAT |
| 共享房产底座 | 长短租经营模式、统一占用、个人业务相对方 | 已规划 | `planned` | 未启用 | Trellis `07-24-shared-property-foundation` |
| 民宿管理 | 日价、房态、预订、入住、退房、人工收退款、保洁 | 已规划 | `planned` | 未启用 | Trellis `07-24-homestay-mvp` |
| 住房出租 | 个人租客、住宅租约、周期费用、交割、采购成本 | 已规划 | `planned` | 未启用 | Trellis `07-24-housing-rental-mvp` |

## 3. 单模块状态记录模板

状态变更时复制以下记录：

```text
模块：
状态：
commit：
UAT 环境标识：
执行时间：
执行人/负责人：
覆盖流程：
自动化结果：
人工验收结果：
证据链接：
遗留问题：
开放限制：
测试数据清理结果：
```

## 4. 全量 UAT 最低检查面

- 功能主流程与关键异常流程。
- SaaS 租户、项目、组织和个人数据范围。
- 菜单、页面、按钮、API 和字段权限。
- 写接口幂等、并发冲突和重复提交。
- 财务金额、状态、审计和不可物理删除要求。
- 文件上传类型、大小、绑定、预览、删除和权限。
- 桌面与 390px 级移动端。
- migration、production-safe seed、bootstrap、健康检查和清理。
- 测试数据标识、回收和残留检查。

## 5. 历史证据说明

以下材料可作为复核输入，但不能脱离其 commit 和环境直接代表当前状态：

- `docs/release/*GATE*REPORT.md`
- `docs/uat/*.md`
- `docs/testing/first-release-regression-plan.md`
- `scripts/e2e/*.mjs`
- `.github/workflows/production-*-gate.yml`

## 6. 关联入口

- [当前产品范围](../product/current-product-scope.md)
- [环境矩阵](../deployment/environment-matrix.md)
- [测试运行手册](../testing/how-to-run-tests.md)
- [生产就绪矩阵](../release/production-readiness-matrix.md)
