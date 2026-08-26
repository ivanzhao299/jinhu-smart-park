# 住房出租模块全流程真实 Chrome UAT（首轮）

## 元数据与结论

- Commit / 分支：`27893186` / `codex/housing-uat-20260826-120125`
- RUN_ID / fixture 前缀：`20260826-120125` / `UAT_HOUSING_20260826_120125_`
- 隔离环境：compose `jinhu-housing-uat-20260826-120125`，Web `3106`、API `3105`、PostgreSQL `55465`，Windows Chrome CDP `9222`
- 方法权威：`docs/testing/windows-chrome-cdp-uat.md`
- local-only 证据根：`/tmp/jinhu-housing-uat-20260826-120125/`
- 截图 manifest：`/tmp/jinhu-housing-uat-20260826-120125/screenshots-manifest.sha256`
- 首轮结论：**FAIL / 不得声明住房全流程 PASS**。真实 UI 已完成登录、租客、资产底座房源配置、角色实例化、用户分配、经营模式申请与独立审批。经用户明确授权，本轮仅在隔离库把 `approval.enforce` 从 production-safe 的 disabled 切到 enforce；真实 execution worker 随即领取既有 approved request，但因 PostgreSQL 参数类型推导错误反复失败并停在 `executing`，房源仍为 `none`。C04-C09 因新的产品执行缺陷继续无法合法进入，未以 SQL 直插业务终态绕过。

## 设计-实现闭环审计表

| 条目 | 设计契约 | 实现结论 | 证据 | gap / UAT 门禁 |
|---|---|---|---|---|
| H-FOUNDATION-01 module dependency | housing_rental 必须依赖 asset | 闭合 | `packages/shared/src/property-business/access-manifest.ts` housing surfaces | 进入浏览器；管理员菜单显示 9 个 canonical surface |
| H-FOUNDATION-02 unit/property scope | housing 业务以 tenant/park/unit 为权威 scope | 部分闭合 | `000178_housing_rental_mvp.sql`、`000192_property_mvp_scope_followup.sql` | 初始若干 unit/party/occupancy 引用为裸 UUID，后续迁移只补齐部分复合 owner scope；列为 schema 风险，不据此宣称跨租户安全 PASS |
| H-FOUNDATION-03 经营资格 | 房源须 long_rent/enabled 后进入住房候选 | 实现闭合 | property operation detail + housing picker | 真实 UI 可从 asset unit 编辑为住房并提交模式切换；最终资格受运行时执行开关阻断 |
| H-FOUNDATION-04 approval adapter | 高风险写 maker-checker，决定与效果执行分离 | **执行链存在产品缺陷** | housing approval adapter/executors、property approval request/stage/decision | enforce 后 worker 领取请求，但 `buildTransitionSnapshot()` 真实 SQL 报参数类型推导错误，停在 `approved/executing` |
| H-FOUNDATION-05 selector/draft | housing 表单使用共享候选/草稿能力 | 部分闭合 | `features/property-shared`、housing create forms | 租约候选在 mode=none 时正确为空；因资格未执行不能完成选择/草稿恢复链 |
| H-LEASE-01 租约状态 | draft→pending_approval→pending_signature→active；active→checkout_pending→terminated；早期态可 void | API/Web 已实现 | housing lease command/detail clients | 主链因房源资格 Blocked，未进入浏览器断言 |
| H-BILLING-01 账单 | 周期生成→应收→支付/减免/逾期，金融活动保留审计 | API/Web 已实现 | billing command/policy、receivable/ledger surfaces | 依赖 active lease，Blocked |
| H-FINANCE-01 void/金额/幂等 | 财务记录不得物理业务删除；高风险写需幂等/审批 | 写入口普遍接 IdempotencyInterceptor；effect audit 存在 | housing controllers/services/migrations | 浏览器未进入；不得外推 PASS |
| H-HANDOVER-01 交割/退租 | 交房/退房与 checkout、余额、occupancy 同步 | API/Web 已实现 | handover/checkout executor；PG concurrency spec | 浏览器 Blocked；真实 PostgreSQL 并发 spec PASS |
| H-REPAIR-01 报修 | 报修→派单→执行→验收，任务投影不替代领域状态 | 已实现 | repair service + housing task adapter | 静态审计发现 completed repair 仍可能被 task adapter 视为 eligible；列风险，未浏览器定性 |
| H-PURCHASE-01 采购 | 申请→审批→入库/转收费 | 已实现 | purchase command/approval executor/effect audit | 依赖业务 fixture，Blocked |
| H-TASK-01 任务 | housing task page/API 与共享审批深链可达 | **不闭合** | role template、permission bundle、`PropertyRuntimeSlots` | 审批模板实例缺 `housing:task:read`；补权后页面 API 可读，但 `requestId` 对 `property-operation-config` 被住房 surface 来源白名单拒绝 |
| H-DASHBOARD-01 KPI | KPI 与租约、应收、流水、采购事实一致 | query 实现存在 | dashboard query/client | 无合法业务事实，Blocked |
| H-RBAC-01 菜单/路由/action | module/page/action/data/field/file 分层 fail-closed | 部分闭合 | manifest、动态菜单、route guards | 审批岗可见 housing/tasks 菜单但 API 403，证明 page/action 模板契约漂移 |
| H-MULTITENANT-01 tenant uniqueness | 业务唯一性必须含 tenant/park owner scope | 部分闭合 | housing migrations/entities | receivable TypeORM metadata 未显式复现 DB 复合唯一约束；跨园区 fixture 只有单园区，未实测 |

### 状态机汇总

- 租约：`draft → pending_approval → pending_signature → active → checkout_pending → terminated`；草稿、待审批、待签署可进入 `void`。续签设计声明存在，但本轮未找到可证明完整浏览器闭环的独立终态链，按 gap 处理。
- 账单/应收：生成应收后以 ledger/payment/waiver 驱动余额；逾期是到期日与未清余额派生语义，不允许把物理删除当作 void。
- 押金：收取、退还、扣除均属于可审计财务流水/审批效果；不得覆盖原记录。
- 交割：交房/退房记录与 lease/occupancy 状态协同；checkout 受余额和并发指针约束。
- 维修、采购、任务：领域状态是权威；共享任务只作 projection/assignment，完成任务不能替代领域完成。

## 流程链矩阵与首轮结果

| Case | 角色 | 流程/断言 | 结果 |
|---|---|---|---|
| C00 | 管理员 | 真实登录、housing 9 面菜单、模块依赖 | PASS |
| C01 | 管理员 | 租客 UI 创建；资产 unit 编辑为住房；operation none/enabled | PASS |
| C02-A | 管理员 | 无 eligible approver 时申请 mode transition | FAIL：API 409 正确，但确认弹窗无可见错误反馈 |
| C02-B | 管理员 | 实例化审批模板、创建并分配审批用户、再次申请 | PASS：显示“审批已提交”，当前模式保持 none |
| C03-A | 审批岗 | housing/tasks 页面与 API | FAIL：模板有 page 权限但缺 `housing:task:read`，页面 403 |
| C03-B | 审批岗 | `housing/tasks?requestId=...` 深链 | FAIL：临时 UI 补权后 API 恢复，但目标审批仍被 surface source allowlist 拒绝；直接 canonical approval detail 可读 |
| C03-C | 独立审批岗 | canonical approval detail 批准 | PASS：`pending_approval → approved`，maker 与 checker 不同账号 |
| C03-D | runtime | approval effect 执行并将 mode 变为 long_rent | **FAIL**：enforce 后 request 进入 `approved/executing`，worker 多次报 `inconsistent types deduced for parameter $1`，operation config 保持 `none/enabled` |
| C04 | 住房业务岗 | 房源 long_rent→创建租约→审批/签署→active | BLOCKED：C03-D 产品 SQL 缺陷阻断房源资格；未旁路制造 active lease |
| C05 | 财务岗 | 批量出账→部分/全额支付→核销→逾期→void | BLOCKED：无合法 active lease/receivable；软删与审计语义未外推 PASS |
| C06 | 业务/审批岗 | 续签/提前解约→押金退还/扣除→handover | BLOCKED：无合法 active lease 与财务事实 |
| C07 | 维修岗 | 报修→派单→执行→验收；completed repair eligible 风险实证 | BLOCKED：主 fixture 未闭合；静态风险未以旁路数据定性 |
| C08 | 采购/审批岗 | 采购申请→审批→入库/转收费 | BLOCKED：主 fixture 未闭合 |
| C09 | 管理员 | dashboard KPI 与事实核对 | BLOCKED：没有合法 active lease/ledger/purchase 事实 |
| C10 | 窄权限/跨园区 | 403 分层、跨园区范围 | PARTIAL：审批岗 403 fail-closed 已实测；隔离 baseline 仅一个园区，跨园区 Blocked |

统计：PASS 4，FAIL 4，PARTIAL 1，BLOCKED 6。原有三个 FAIL 为前端/RBAC 契约缺陷；新增 FAIL 是 enforce 后暴露的模式切换 executor 真实 PostgreSQL 缺陷。C04-C09 均逐项保留 Blocked，未把依赖阻塞合并或降级为 PASS。

## approval.enforce 隔离操作审计

- 授权范围：仅 compose `jinhu-housing-uat-20260826-120125` 的数据库 `jinhu_housing_uat_20260826_120125`、tenant `10000001`、park `20000001`；未操作生产。
- 方式：`docker compose -p jinhu-housing-uat-20260826-120125 -f /tmp/jinhu-housing-uat-20260826-120125/compose.yml exec -T postgres psql`，在事务内用旧值、contract hash 与 version 的 CAS 条件执行单行 `UPDATE public.sys_property_runtime_control`，随后同事务回读。
- UTC 时间：before `2026-08-26 04:59:59.219110`；enabled_at `2026-08-26 04:59:59.219785`；after `2026-08-26 04:59:59.220341`。
- before：`enabled=false`、`control_mode=disabled`、`enabled_by/enabled_at/approval_reference=NULL`、`disabled_reason=b2a-contract-correction-000195`、`version=3`。
- 结果：`UPDATE 1`。
- after：`enabled=true`、`control_mode=enforce`、具名隔离库管理员 UUID 写入 `enabled_by`、`approval_reference=UAT-20260826-120125-APPROVAL-ENFORCE`、`disabled_reason=''`、`version=4`。
- 业务回读：request `135141f4-0457-4648-800b-139f145c60b7` 从 `approved/not_started` 被 worker 领取为 `approved/executing`；attempt 至少两次，房源 `cc665bea-23ff-413a-a93b-d2acf789c650` 仍为 `none/enabled/version 1`。API 日志连续记录参数类型推导错误，停止继续人工触发。

## 产品缺陷与修复队列

| 优先级 | 编号 | 缺陷 | 根因假设 / 最小修复面 | 状态 |
|---|---|---|---|---|
| P1 | HOU-UAT-01 | mode transition 提交 409 时弹窗无可见失败反馈 | property operation mutation catch/feedback 未进入 dialog 可访问区域 | Issue [#402](https://github.com/ivanzhao299/jinhu-smart-park/issues/402)，待修复 PR |
| P1 | HOU-UAT-02 | PROPERTY_OPERATIONS_APPROVER 可见 housing/tasks，但实例化权限缺 `housing:task:read` | HOUSING_APPROVER bundle 与 housing task page action 契约漂移 | Issue [#403](https://github.com/ivanzhao299/jinhu-smart-park/issues/403)，待修复 PR；迁移必须逐租户论证 |
| P1 | HOU-UAT-03 | property mode approval 深链落 `/housing/tasks` 后被来源白名单拒绝 | housing runtime slot 未接受 `property-operation-config`，而通知/return contract 把链接导向 housing/tasks | Issue [#404](https://github.com/ivanzhao299/jinhu-smart-park/issues/404)，待修复 PR |
| P2 gap | HOU-UAT-G01 | 隔离/首发初始化没有受支持的 UI/命令启用 approval runtime | production-safe seed 默认 disabled 合理，但全流程 UAT 缺显式、可审计的非生产启用步骤 | Issue [#405](https://github.com/ivanzhao299/jinhu-smart-park/issues/405)，待修复 PR；非生产限定 |
| P1 | HOU-UAT-04 | enforce 后 mode transition executor SQL 参数类型推导失败 | `buildTransitionSnapshot()` 跨表复用未显式 cast 的参数，真实 PG execute-path 无回归覆盖 | Issue [#406](https://github.com/ivanzhao299/jinhu-smart-park/issues/406)，待修复 PR |

## 证据与验证

- 截图 5 个、均非零：原 C00-C03 四张，加 `C03D-enforce-execution-failed.png`（222007 bytes）；绝对目录 `/tmp/jinhu-housing-uat-20260826-120125/screenshots/`，SHA-256 manifest 已更新为 5 行。
- C03-D DOM/URL 证据：canonical approval detail 在真实 Chrome reload 后显示 action `property.mode-transition.request`、source `property-operation-config`、decision `approved`、execution `executing`；快照在 local-only `evidence/C03D-enforce-page.snapshot.txt`。
- 网络证据只保存脱敏响应 body；报告、仓库和 manifest 不包含密码、JWT、Cookie 或连接串。
- PostgreSQL spec：首次因随机密码未 URL encode 导致连接串解析失败（环境构造，不计产品结果）；第二次也是本题最后一次运行，`housing-checkout-concurrency.pg.spec.ts` 为 1 test / 1 pass / 0 fail / 0 skip。
- 迁移：253/253 成功；production seed 成功；bootstrap 前 baseline 仅缺管理员（预期），bootstrap 后全部 PASS。
- residual 六类已逐表采集到 local-only `evidence/residual-before.log` 与 `evidence/residual-after.log`。housing 8 表、effect 4 表、file 与物理文件均为 0；asset 中 operation config=1、party=1；approval runtime 非零包括 request/stage/decision/manifest 各 1、actor exclusion 3、audit 13、mutation receipt 2。before/after 除时间外一致，因此 residual gate **FAIL**，不能声明清理前归零。
- UI 已真实点击“退出”并回到 `/login`。同参 compose `down --volumes --remove-orphans` 已移除本轮 PostgreSQL 容器、network 与 volume；3105/3106/55465 监听归零，compose `ps -a` 为空。Windows CDP 9222 仍可达但 Linux 侧无可核验 PID，遵守“不动主 Chrome”约束未强制关闭，并列为清理遗留。

## 限制与外部门

- 首轮验收没有修改产品代码，也没有 SQL 直插业务 fixture 或终态。
- 唯一 SQL 状态变更是经用户授权、限定本轮隔离库且完整审计的 runtime control 开关；业务 request、房源、租约与财务终态均未由 SQL 制造。
- 只有单园区 fixture，跨园区数据范围仍为 Blocked；403 分层的部分证据不能替代跨园区验证。
- 自动化操作者的真实 Chrome UAT 不替代住房业务、财务、审批、安全/运维真人代表的具名签署。
- UAT Trellis 任务保持 `in_progress`；只有缺陷上线、完整复测 PASS、PG spec 和 residual 门禁全部通过后才能归档。
