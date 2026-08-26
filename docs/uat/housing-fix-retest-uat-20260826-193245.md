# 住房修复主链复测 UAT

## 结论

- RUN_ID：`20260826-193245`
- 被测 revision：`d16f4bfd8b8668b8923f0a09dfc10f87c8db91ff`（包含 PR #408/#409/#410/#413/#414 与当时 production seed；不使用可移动 `main` 作为证据）
- 执行人：`jinhuit`；开始/结束：2026-08-26 19:37 / 19:57（Asia/Singapore）
- API/Web PID：`525848` / `525942`；进程输出接入本轮受控 PTY，未写独立 failure-log 文件，故日志路径记为 **未持久化（证据限制）**
- 结论：**PARTIAL / 不归档住房 UAT**。#402/#403/#404/#405/#406 对应修复均已合并；承载 #414 的 main revision `27de6069e70db4bb200645f2d5c7b72e4323f22e` 后续包含于本轮被测 revision。替代 main CI `32962707616` 与 Deploy Production `32962707669` 均为 success（2026-08-26）；这里仅证明已部署 revision 与隔离复测关联，不把隔离结果外推为生产业务验收。原 C03-D executor 缺陷在真实 PostgreSQL 16 中复测通过，住房主链推进到租约、账单、支付、维修、采购和 dashboard；但住房域无续租入口、押金退还/checkout 未完成，且任务 reconciliation 暴露新的 PostgreSQL 参数类型错误，因此不能声明全链 PASS。

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
| C00 | PASS | PASS | 独立 Chrome profile 真实表单登录，住房菜单可见 |
| C01 | PASS | PARTIAL | 本轮复用 production-safe asset 后通过受控 API 改住房用途；未重新执行完整 UI 建链，不能算 UI 回归 PASS |
| C02-A | FAIL | **NOT RETESTED** | 未重走“无 eligible approver→409→弹窗可见错误”场景，#408 的交互修复不得由本轮其他证据外推 |
| C02-B | PASS | NOT RETESTED | 本轮审批账号由隔离 bootstrap 创建，未重复角色模板 UI 实例化流程 |
| C03-A/B/C | RBAC/深链 FAIL，审批 PASS | 修复上线；本轮聚焦主链 | #409/#410/#413 已合并并主链双绿 |
| C03-D | FAIL：executor 参数类型错误 | **PASS** | mode request `bf20e584-8bf8-46d7-bef6-5d21dbca6f00` 为 approved/executed；房源 `none → long_rent`、version 2；Chrome 显示“已批准/已执行” |
| C04 | BLOCKED | PASS（系统链）/真人签署外部门 | draft→pending_approval→pending_signature→active；使用本轮合成 PDF 只验证系统附件门禁，不代表真人签署 |
| C05 | BLOCKED | PARTIAL | 固定费用出账 96.67；40.00 部分支付后 56.67 全额核销；押金 2500 入账；采购转收费 35 后核销。未构造时钟回拨，逾期分支未实测；void 未以物理删除替代 |
| C06 | BLOCKED | **BLOCKED / OPERATOR ERROR** | move-out handover completed，lease 进入 checkout_pending；住房域没有续租 UI/API。两次 deposit_refund API 请求漏传现有必填 `receivable_id`，400 属于操作者输入错误，不能归因产品契约；环境已销毁，正确带 deposit receivable 的 refund/checkout 记为 NOT RETESTED，未伪造 terminated |
| C07 | BLOCKED | PASS（状态链） | 报修 10→20→30→40→50→60 完成；housing tasks 返回 `status=completed` 是历史集合设计。eligibility resolver 排除 status 60，本轮不再把历史可见性误判为 completed-eligible 缺陷 |
| C08 | BLOCKED | PASS（系统链） | draft→approved→paid；独立审批；转收费由第二审批人批准并执行，生成 35.00 receivable |
| C09 | BLOCKED | PASS | Chrome KPI 与 DB/API 事实一致：active 1（handover 后 checkout 1）、应收 2631.67、已收 2631.67、未收 0、approved purchase 35；390×844 无横向溢出 |
| C10 | PARTIAL | BLOCKED | production-safe baseline 只有一个园区；未伪造跨园区 fixture |

## 新观察与阻断

1. `PropertyTaskReconciliationScheduler` 对 housing billing、repair、purchase、lease source 反复出现 `inconsistent types deduced for parameter $1` 或随后 `property-runtime-unavailable`。审批 execution 主链不受影响，但任务投影/重建可靠性不能判 PASS。
2. work order 确认完成（status 60）后，`GET /housing/tasks` 仍返回 completed 历史；代码核验确认 eligibility resolver 不包含 60，因此 completed-eligible 风险未成立。
3. 住房域当前没有续租入口；商业 leasing renewal 不能冒充住房续租。
4. deposit refund 两次请求均由操作者漏传表单已有的必填 `receivable_id`，不能作为产品 finding；正确请求和 checkout 留作 NOT RETESTED。
5. 本轮合成 PDF 仅证明上传、绑定、签署登记和 active 门禁；真人线下签署仍需业务代表具名验收。

## 证据索引

- local-only 根：`/tmp/jinhu-housing-uat-20260826-193245/`
- 截图：10 个 PNG，包含登录、C03-D、active lease、finance、repair、purchase、dashboard desktop/mobile、logout。
- SHA-256：`/tmp/jinhu-housing-uat-20260826-193245/screenshots-manifest.sha256`（10 行）。
- Chrome：151.0.7922.138，独立 CDP 9333/profile；desktop 1440×960，mobile 390×844，dashboard mobile `overflow=false`。
- 敏感信息未写入报告、截图文件名或 manifest。

## residual 与清理

- before：本轮创建 party 1、lease 1、workorder 1、file 1、purchase 1，并产生审批/执行/财务/占用关联事实。
- after：truncate 后 `biz_party`、identity submission、approval request、property outbox、work order、`sys_file`、housing lease 均为 0；物理文件为 0。
- **residual gate 未验证**：清理使用了隔离库内的 `TRUNCATE ... CASCADE`，而不是预先冻结的 RUN_ID/fixture 谓词逐表删除。该结果会同时移除 baseline 与未跟踪副作用，因此零计数是环境清空结果，不能作为 fixture-scoped residual closure。随后销毁 volume 不改变此判定。
- UI 已真实点击退出并回到 `/login`。
- PID：先由 shell jobs 核验 API `525848`、Web `525942` 后对确切 jobs 发送 SIGTERM；二者均退出。
- compose：同参 `down --volumes --remove-orphans` 明确移除本轮 PostgreSQL container、network、volume；按 project label 复查为空，未操作非本轮容器。
- 端口：`55473/3115/3116/9333` 经 `ss -ltn` 复查均无监听；独立 Chrome 9333/profile 进程按同时匹配端口与 RUN_ID 的命令行精确关闭。因关闭而非保留常驻实例，无法再停留 `about:blank`，按“独立实例已退出”记录。
- 临时 env：本轮未创建 env 文件；secret 只存在受控 shell 进程环境，随进程退出释放。local-only 截图与 manifest 按证据策略保留。

## 归档决定

住房 UAT 父任务及修复任务暂不归档。后续归档必须完整补齐：任务 reconciliation 参数错误、正确参数的 deposit refund/checkout、住房续租设计缺口、C02-A 可见错误、角色/数据范围与 fail-closed、跨园区、幂等 replay/conflict、terminal write 与 void/审计、并发保护、真实 PostgreSQL `housing-checkout-concurrency.pg.spec.ts`、fixture-scoped residual before/after、完整真实 UI 写链，以及上述资源清理核验。真人签署仍保留为外部门；以上任一未完成都不得归档。
