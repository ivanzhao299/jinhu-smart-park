# 民宿修复全上线自动复测报告

## 元数据

- RUN_ID：`20260826-1015`
- 基线：`origin/main@9cbe464c`（包含权限迁移修复 `cfc8975c`）
- 环境：隔离 compose `jinhu-homestay-retest-20260826-1015`，PostgreSQL 16，API `3103`，Web `3104`
- 浏览器：独立 Windows Chrome 151 / CDP 1.3；桌面 `1440×1000`、手机宽度 `390×844`
- 截图根：`/tmp/jinhu-homestay-retest-20260826-1015/screenshots/`（仓库外 local-only）
- 结论：本轮四项上线后自动复测 **PASS**；不替代外部真人岗位具名签署。

## 上线前后对比

| 场景 | 2026-08-25 复测前 | 本轮结果 | 证据 |
|---|---|---|---|
| 费率空态 | 正常空态触发 404 Console error，FAIL | `GET /rates/:unitId?...response_version=2` 两次均 200；页面显示“尚未配置价格，请先保存基础价格”；Console 无 error/warn | `C01-rate-empty-{desktop,mobile}.png`、`evidence/rates-empty-selected.txt` |
| 入住率口径 | confirmed 未入住被计为 occupied，FAIL | 4 个可租房源中仅 checked_in 计入住，confirmed reserved 不计；Dashboard 为 `1/4=25.00%` | `C02-occupancy-dashboard-{desktop,mobile}.png`、PG spec |
| 财务同账 | 手工 charge 的 list/detail 公式存在分叉风险 | 同一订单列表与详情均显示费用 400.00、已收 125.00、余额 275.00；详情流水为 charge 400 + payment 125 | `C03-finance-list-desktop.png`、`C03-finance-detail-{desktop,mobile}.png` |
| 民宿任务经办 RBAC | bundle 缺 `homestay:task:read`，BLOCKED | 受保护模板经 UI 实例化、用户经 UI 绑定后登录落点为 `/homestay/tasks`；审批决定 API 返回 403；用户仅有当前园区访问关系 | `C04-rbac-task-operator-{desktop,mobile}.png`、`evidence/task-user-login-landing.txt`、`task-user-approval-decide-result.json` |

## Fixture 链与浏览器执行

- 真实 UI 在角色管理选择“民宿经办”受保护模板，确认包含 `homestay:task:read` 及 `property_task:read/claim/process/release` 且不含审批决定权限，实例化为普通园区角色。
- 真实 UI 在用户管理创建任务操作员账号并绑定上述普通角色；另从房源经营审批模板实例化独立审批角色并创建独立审批账号。角色、用户和绑定成功提示的 accessibility snapshot 已落盘。
- 业务口径 fixture 位于本轮一次性数据库，统一使用 `UAT-20260826-1015-*` 编码/remark；没有连接或修改生产数据。
- 登录任务操作员后自动落到 `/homestay/tasks`；直接调用审批决定写入口得到 403。审批读取投影与审批决定权限分层，不把“能看列表”误报成“能审批”。
- 390px 页面没有横向溢出或原生文件控件问题；本轮未触达上传操作。

## 防回退

- 相同 `X-Idempotency-Key` 连续提交费率保存，两次均 200、返回同一配置 id/version（字段序列化顺序不同，故不以原始 JSON 字符串相等冒充 replay 证据）。
- 未登记住客入住由真实 API 拒绝；独立策略测试继续冻结 guest roster、实名证据与凭证三层前置条件。环境中一次手工 occupancy fixture 未满足权威 owner 契约，返回 409；未把该结果误报为“命中住客人数规则”。
- 登录路由真实证明窄角色桌面落点 `/homestay/tasks`；前端 post-login 单测覆盖桌面/390px 与 wildcard 分支。
- guest candidate 的 tenant/park/unit 过滤由既有 service/contract 测试覆盖；本轮没有构造第二园区，跨园区为静态契约加单园区 user access 佐证，不冒充真实园区切换。

## PostgreSQL spec

- 首次真实运行暴露测试期望错误：历史日期 availability 只期望 reserved，遗漏同日其他可经营房源应返回 available；产品查询结果正确。
- 修正测试期望后第二次（最终）运行：`homestay-dashboard-availability-query.pg.spec.ts` **1/1 PASS，0 skip**。
- 核心断言保持不变：目标日 occupied=2、rentable=4、occupancy=50%；confirmed reservation 为 reserved，实际入住才是 occupied。
- 日志：`/tmp/jinhu-homestay-retest-20260826-1015/evidence/pg-spec-retest.log`。

## 截图持久化证明

仓库根不作为本轮截图落点；9 张 PNG 写入绝对 `/tmp` 路径，均非零，大小为 99,393–553,538 bytes。完整清单：`/tmp/jinhu-homestay-retest-20260826-1015/evidence/screenshot-manifest.txt`。

## residual 六类逐表审计

使用同一 RUN_ID/fixture id 谓词执行清理前后查询；软删除也计 residual。清理前触达：party 2、identity submission 2、mutation receipt 4、outbox 2，其余候选表 0。清理后以下每表均为 0：

- party：`biz_party`、`rel_party_role`
- identity：`biz_party_identity_submission`、`biz_party_identity_snapshot`、`biz_party_identity_decision`、`biz_party_identity_verification_queue`、`biz_party_identity_assignment_audit`、`rel_party_identity_draft_file`、`rel_party_identity_snapshot_file`
- approval：`biz_property_approval_request`、`biz_property_approval_stage`、`biz_property_approval_decision`、`biz_property_approval_audit`、`biz_property_approval_actor_exclusion`、`biz_property_execution_effect_receipt`、`biz_property_mutation_receipt`
- outbox：`biz_property_outbox`、`biz_property_inbox`、`biz_property_event_dlq`
- workorder：`biz_work_order`、`biz_work_order_log`
- file：`sys_file`、`sys_attachment`；本轮未产生物理上传文件

原始结果：`evidence/residual-before.log` 与 `evidence/residual-after.log`。精确清理发生在一次性本地库，随后还会删除本轮 compose volume；没有操作他人容器。

## 变更与限制

- 产品实现未改。唯一代码变更是校正 PostgreSQL spec 对历史 availability 完整列表的期望，避免把合法 available 行误判为失败。
- 自动化验证不等于现场人员真人签署；跨园区切换因本轮只有一个园区未做真实 UI 切换；未登记住客的本轮手工 API fixture 未精确命中 roster 错误文案，相关 fail-closed 与政策分支由 API 409 和既有策略测试共同覆盖。
- 本报告随证据 PR 进入审查、CI、合并；合并后 main CI 与 Deploy Production 结果在 PR/最终交付中记录。
