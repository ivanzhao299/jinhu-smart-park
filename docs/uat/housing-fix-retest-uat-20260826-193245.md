# 住房修复主链复测 UAT

## 结论

- RUN_ID：`20260826-193245`
- 基线：PR #408/#409/#410/#413/#414 与 production seed 同步后的 `main`
- 结论：**PARTIAL / 不归档住房 UAT**。#402/#403/#404/#405/#406 对应修复均已上线；原 C03-D executor 缺陷在真实 PostgreSQL 16 中复测通过，住房主链推进到租约、账单、支付、维修、采购和 dashboard。但住房域无续租入口，押金退还复测在 API 参数契约处停止，且任务 reconciliation 暴露新的 PostgreSQL 参数类型错误，因此不能声明全链 PASS。

## 隔离环境与开关审计

- compose：`jinhu-housing-uat-20260826-193245`
- PostgreSQL / API / Web / Chrome CDP：`55473 / 3115 / 3116 / 9333`
- 数据库：`jinhu_housing_uat_20260826_193245`
- migration：254/254 成功，8 个 prerequisite 成功，0 skip/0 fail。
- production seed：27 个 production-safe seed 全部成功。
- baseline：bootstrap 前仅缺管理员；bootstrap 后在 SMS fixed code、SMS visible、WeChat mock 均禁用时 PASS。
- #414 入口：`pnpm property:approval-runtime:enable-uat` 在目标 compose 身份校验后成功；`approval.enforce` 从 disabled/version 3 切到 enforce/version 4。审计 actor 为本轮具名管理员，reference=`PR-414-UAT-20260826-193245`，request id=`housing-uat-20260826-193245-runtime-enable`。
- 未接触生产环境或其他容器。

## 前后对比矩阵

| Case | 首轮 | 本轮 | 证据与边界 |
|---|---|---|---|
| C00-C02 | 部分 PASS/FAIL | PASS（入口与管理员真实 Chrome） | 独立 Chrome profile 登录，住房菜单可见；#414 CLI 真实可用 |
| C03-A/B/C | RBAC/深链 FAIL，审批 PASS | 修复上线；本轮聚焦主链 | #409/#410/#413 已合并并主链双绿 |
| C03-D | FAIL：executor 参数类型错误 | **PASS** | mode request `bf20e584-8bf8-46d7-bef6-5d21dbca6f00` 为 approved/executed；房源 `none → long_rent`、version 2；Chrome 显示“已批准/已执行” |
| C04 | BLOCKED | PASS（系统链）/真人签署外部门 | draft→pending_approval→pending_signature→active；使用本轮合成 PDF 只验证系统附件门禁，不代表真人签署 |
| C05 | BLOCKED | PARTIAL | 固定费用出账 96.67；40.00 部分支付后 56.67 全额核销；押金 2500 入账；采购转收费 35 后核销。未构造时钟回拨，逾期分支未实测；void 未以物理删除替代 |
| C06 | BLOCKED | **FAIL/BLOCKED** | move-out handover completed，lease 进入 checkout_pending；住房域没有续租 UI/API。deposit_refund 两次按页面语义提交均返回“Receivable is required for refund or waiver”，遵守同题最多两次后停止；未伪造 terminated |
| C07 | BLOCKED | PARTIAL / finding | 报修 10→20→30→40→50→60 完成；完成后 housing tasks 仍返回 `status=completed` 投影，需产品确认是否仍应进入 eligible 集合 |
| C08 | BLOCKED | PASS（系统链） | draft→approved→paid；独立审批；转收费由第二审批人批准并执行，生成 35.00 receivable |
| C09 | BLOCKED | PASS | Chrome KPI 与 DB/API 事实一致：active 1（handover 后 checkout 1）、应收 2631.67、已收 2631.67、未收 0、approved purchase 35；390×844 无横向溢出 |
| C10 | PARTIAL | BLOCKED | production-safe baseline 只有一个园区；未伪造跨园区 fixture |

## 新观察与阻断

1. `PropertyTaskReconciliationScheduler` 对 housing billing、repair、purchase、lease source 反复出现 `inconsistent types deduced for parameter $1` 或随后 `property-runtime-unavailable`。审批 execution 主链不受影响，但任务投影/重建可靠性不能判 PASS。
2. work order 确认完成（status 60）后，`GET /housing/tasks` 仍返回对应 `housing_repair` completed 项；completed-eligible 风险已由真实状态链实证。
3. 住房域当前没有续租入口；商业 leasing renewal 不能冒充住房续租。
4. deposit refund API 要求 receivable，而住房财务表单语义未使该必填关系清晰闭合；两次尝试均 400，checkout 因押金余额未归零而未继续。
5. 本轮合成 PDF 仅证明上传、绑定、签署登记和 active 门禁；真人线下签署仍需业务代表具名验收。

## 证据索引

- local-only 根：`/tmp/jinhu-housing-uat-20260826-193245/`
- 截图：10 个 PNG，包含登录、C03-D、active lease、finance、repair、purchase、dashboard desktop/mobile、logout。
- SHA-256：`/tmp/jinhu-housing-uat-20260826-193245/screenshots-manifest.sha256`（10 行）。
- Chrome：151.0.7922.138，独立 CDP 9333/profile；desktop 1440×960，mobile 390×844，dashboard mobile `overflow=false`。
- 敏感信息未写入报告、截图文件名或 manifest。

## residual 与清理

- before：本轮创建 party 1、lease 1、workorder 1、file 1、purchase 1，并产生审批/执行/财务/占用关联事实。
- after：`biz_party`、identity submission、approval request、property outbox、work order、`sys_file`、housing lease 均为 0；关联表通过外键级联归零；物理文件为 0。
- 清理仅发生在本轮 disposable database。为保证逐表归零，清理事务 truncate 了隔离库相关业务聚合并级联其关联数据；随后才销毁本轮 volume，未用 volume 删除倒推 residual。
- UI 已真实点击退出并回到 `/login`。

## 归档决定

住房 UAT 父任务及修复任务暂不归档。只有任务 reconciliation 参数错误、completed repair 任务语义、deposit refund/checkout 契约闭合并复测通过后，才满足“完整复测 PASS 才归档”。真人签署与跨园区仍保留为外部门。
