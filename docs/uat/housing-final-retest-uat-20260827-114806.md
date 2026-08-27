# 住房收尾复测 UAT

## 结论

- RUN_ID：`20260827-114806`
- 被测 revision：`14fec6f90297a00e8caba814de2b1b1b15b8f4a4`，包含 Issue #420 的 PR #423 squash commit `5a3b02cb75c351cea650354398838779cee10279`
- 执行日期：2026-08-27（Asia/Singapore）
- 结论：**PARTIAL / 不归档**。#420 五源 reconciliation、正确参数押金退款、C02 错误反馈与审批深链均通过；但本轮业务链生成了不可变审批/效果审计，不能在不绕过数据库 immutable trigger 的情况下满足“六类逐表精确 DELETE 后归零”。隔离 volume 已销毁且端口、Chrome、compose 资源归零，但这不能冒充 fixture-scoped DELETE gate，所以住房父任务与六个修复子任务保持未归档。

## #423 闭环

- PR #423 最终 review 未发现 major issue；PR CI（含 PostgreSQL 16 reconciliation gate）全绿后 squash merge。
- Issue #420 随 PR merge 关闭。
- merge commit 的 Deploy Production 成功；同一 commit 的 CI 被后续 main 并发取消。已确认该 commit 是后续 main `14fec6f` 的祖先，后续 main CI 与 Deploy Production 均为 success。
- RBAC worktree 已 clean fast-forward；旧修复分支删除并 prune。本报告使用独立 evidence branch。

## 隔离环境

- compose：`jinhu-housing-uat-20260827-114806`
- PostgreSQL / API / Web / Chrome CDP：`55493 / 3135 / 3136 / 9353`
- 数据库：`jinhu_housing_uat_20260827_114806`
- 255/255 migrations、8/8 prerequisites、production-safe seed、bootstrap-admin 与 bootstrap 后 baseline 全部通过。
- `pnpm property:approval-runtime:enable-uat` 通过完整目标身份校验，将 `approval.enforce` 从 disabled/version 3 切到 enforce/version 4；reference=`PR-414-UAT-20260827-114806`。
- 最初误用 `housing-final` 前缀的隔离栈不满足 #414 fail-closed 命名契约，已销毁并以本 RUN_ID 从零重建；该错误栈结果未计入本报告。

## 复测矩阵

| 场景 | 结果 | 关键断言 |
|---|---|---|
| #420 五源 reconciliation | PASS | 真实 PostgreSQL 16 gate 3/3；同一隔离数据库 scope 投影恰含 `housing_billing,housing_handover,housing_lease,housing_purchase,housing_repair`，head/assignment/receipt/audit 契约由 gate 验证；API 日志无 `inconsistent types deduced` / 42P08 |
| 押金退款正确路径 | PASS | active lease 完成 move-out；退款命令显式携带 deposit receivable `b00801de-...`；`deposit_refund=2500.00/confirmed`，approval `approved/executed`，effect hash 与 execution key 非空；押金余额 0，checkout 后 lease=`terminated` |
| C02 无审批人 | PASS | 暂时移除普通审批角色后提交返回 409 `approval-no-eligible-approver`，错误位于弹窗 `role=alert` 且截图可见 |
| C02 有审批人及深链 | PASS | 恢复普通角色后提交成功；独立审批账号打开 `/housing/tasks?requestId=8f3346ad-...`，看到 `property.mode-transition.request · pending_approval / not_started` 并批准；executor 推进 `long_rent/enabled/version 2` |
| Dashboard KPI | PASS | 页面显示应收 ¥2635.15、已收 ¥2635.15、未收 ¥0.00、已批采购成本 ¥35.15，与本轮 lease/ledger/purchase 事实一致；桌面 viewport 无横向 overflow |
| residual 六类 | **FAIL** | before：housing 11、property task 30、approval runtime 66、files 5、UAT RBAC 6、asset fixture 2。审批、住房 effect 与 task audit 表存在 immutable DELETE trigger；未禁用 trigger、未用 `session_replication_role`、未 TRUNCATE。故不能提供逐表 DELETE 后六类归零证据 |

## 执行说明与修正

- 住房 API 主链第一次运行在 purchase transfer 暴露隔离 fixture 的第二审批人缺 `property_approval:decide`；补齐由模板实例化的普通审批角色后，从已存在的真实 purchase/lease 继续执行，没有 SQL 制造业务终态。
- 第二次完整脚本尝试因显式固定房源与第一条 active lease 时间重叠而被资格检查 409 拒绝；达到同题两次上限后不再重跑。改为 continuation 只推进第一条真实链：两笔采购转收费、应收结清、move-out、正确押金退款和 checkout。
- 仓库自带 API E2E safety gate要求 API 与 PostgreSQL 同属 Docker compose；本轮 API/Web 是绑定到隔离 PostgreSQL 的本机进程，因此未伪造容器身份。使用 local-only 派生脚本移除该容器 gate，业务请求仍全部经过真实 `127.0.0.1:3135/api/v1`，此限制保留在结论中。

## 证据与隐私

- local-only 根：`/tmp/jinhu-housing-uat-20260827-114806/`
- 截图：12 个非空 PNG；manifest：`screenshots-manifest.sha256`
- 关键证据：`five-source-pg-gate.log`、`five-source-db-proof.txt`、`deposit-refund-db-proof.txt`、`housing-continuation.log`、`runtime-enable.log`、`residual-before.log`、`teardown-proof.txt`
- Chrome 151，独立 profile/CDP；未使用 chrome-devtools MCP，记为 `N/A (not available)`。
- 已对 evidence 与 manifest 扫描本轮已知密码/JWT/数据库 secret，结果 PASS；报告与文件名不含这些值。frozen env 权限为 0600，teardown 后已删除。

## 清理与归档决定

- UI 已点击退出并回到 `/login`。
- API/Web PID 与 stdout 路径核验后通过受控 PTY 停止。
- 独立 Chrome 进程同时匹配 CDP 9353 与 RUN_ID profile 后精确停止；未触碰主 Chrome。
- 同参 compose `down --volumes --remove-orphans`；compose 资源 0，四端口监听 0。`phoenix-v3-db`、`yuzhou-mssql`、`jinhu-smart-park-postgres` 状态未改动。
- 未执行 `TRUNCATE CASCADE`，未禁用不可变审计 trigger。由于 residual gate FAIL，本轮报告合并后仍不归档住房父 UAT 任务及 #408/#409/#410/#413/#414/#420 六个修复子任务。
