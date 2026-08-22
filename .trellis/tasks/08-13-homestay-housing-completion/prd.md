# 民宿与住房模块完整交付闭环 PRD

## 目标

在不重复既有 PR192、Issue #251、#253、#260、#262 交付的前提下，补齐民宿管理和住房出租从数据库、权限、前端、自动化门禁到目标 UAT/生产就绪的剩余缺口，并形成可审计的 Issue → Trellis 子任务 → 提交 → PR → Codex Review → 合并 → 部署监控闭环。

## 已确认事实

- 民宿/住房 MVP、共享房产底座和 PR192 Track A 工作台技术任务已完成；当前产品矩阵仍为 `uat_pending`、未生产启用。
- Issue #253 已覆盖租户模块与首管菜单授权；Issue #260 已覆盖用户角色分配；Issue #262 / PR #263 已覆盖房产业务岗位模板、权限包、current_park、字段/动作矩阵、visible 语义和角色页面应用能力。不得重复实现。
- PR192 human UAT 已定义真人岗位、签署、H0-H5 和 production_ready AND 门；PR223 提供本地 Windows Chrome 技术证据，但仍有 1 个环境/负向角色 blocker，且不等于真人签署。
- 生产部署、备份、回滚、健康检查、观察期和 Docker cleanup 复用 `06-28-production-deployment` 及现有 release 文档，不新建第二套发布状态机。
- 民宿真实 API E2E 文件存在，但没有 package/CI 门禁且文档滞后；住房真实 API E2E 已有 package 命令但未进入 CI/release gate。
- 仍存在若干数据库父子关系仅用 UUID 外键，不能在数据库层阻止跨 tenant/park owner 误绑。
- Housing 共享运行时任务槽可能漏接 `housing_repair`；必须先确认后端确实产生该 source，再做最小前端修复。

## 范围

### 子任务 A：数据库 owner/scope 完整性加固

- 新增 forward-only migration，不修改既有成功迁移。
- 对民宿/住房遗留子表执行跨 tenant/park preflight。
- 用 tenant/park/id（必要时 currency/owner identity）复合外键替换裸 UUID owner FK。
- 将新迁移纳入 Track-B migration/constraint gate。
- 增加跨作用域负向 PostgreSQL 回归。

### 子任务 B：权限闭环集成与验证

- 以前置 PR #263 的岗位模板、bundle、current_park、字段/动作策略和 visible 合同为唯一实现来源。
- 验证民宿/住房 API 是否实际执行岗位字段策略；若只有硬编码投影，接入统一 field policy，保留更严格的凭证/身份保护下限。
- 验证非超级管理员的菜单、canonical page、API、data scope、file scope、字段投影正向/负向/跨园区矩阵。
- 不重复用户角色 UI、首管模块授权或角色 bundle 管理页面。

### 子任务 C：前端剩余闭环

- 核验 `housing_repair` property task source 的后端生产链；确认成立后接入 Housing `PropertyRuntimeSlots` 并补契约测试。
- 对民宿/住房 landing、上传、离线队列、409/403/404、桌面/390px 做回归；仅修复被真实证据证明存在的问题。
- 本轮纳入民宿取消、退款、减免，以及住房审批、作废、退租、采购付款/转收费、退款和押金退还。
- 每个高风险动作只有在后端审批、权限、幂等、审计和终态约束五项均完整时才开放 UI；任一项不足即继续 fail-closed，并在 GitHub Issue 中列明缺口和后续范围。

### 子任务 D：自动化与发布门禁

- 增加民宿 API E2E package 入口和隔离 fixture/cleanup，确保 residual=0。
- 将民宿、住房真实 API E2E 接入明确的 CI 或手动 release gate。
- 覆盖模块启停、角色权限、数据范围、字段/文件访问、占用互斥、幂等 replay/conflict、金额精度、终态不可变和附件引用保护。
- 同步民宿/住房专项证据与全产品矩阵，绑定 commit、环境和时间。

### 子任务 E：目标 UAT 与生产就绪收敛

- 作为现有 PR192 human-UAT/readiness 的领域补充，不复制 H0-H5、签署或发布状态机。
- 修复并复测 PR223 的 `ENV-001 / ROLE-NEG-01`。
- 将机器可完成证据交付给真人岗位 UAT；真人、环境与发布负责人完成其权限范围内的签署、备份恢复、回滚演练、发布窗口和观察期。
- 只有 PR192 的所有 AND 条件满足后才允许标记 `uat_passed` / `production_ready`。

## 明确排除

- 重做 Issue #251 房产控制面、Issue #253 首管模块菜单、Issue #260 用户角色管理、Issue #262 岗位权限产品化。
- 修改已成功生产迁移。
- 新建第二套权限 manifest、landing resolver、上传组件、UAT 状态机或部署流程。
- 用 SUPER_ADMIN、mock server、静态截图或 API 调用代替真人岗位 UAT。
- 绕过 branch protection、required review、生产环境审批或失败门禁。

## 验收标准

- 每个真正独立的缺口先完成重复性核查，再建立内容不重叠的 GitHub Issue 和 Trellis 子任务。
- 数据库跨 scope 负向写入被数据库约束拒绝，迁移可在空库和升级库执行，迁移 gate 通过。
- 标准非超级管理员岗位在 current_park 正向可用，缺权、跨园区、字段和文件越权均 fail-closed。
- 民宿、住房真实 API E2E 在隔离数据库可重复执行并清理为 residual=0，进入 CI/release gate。
- 所有 canonical 页面通过桌面和 390px；无横向溢出，上传、离线、冲突和错误状态可验证。
- lint、typecheck、build、目标 unit/PG/API E2E、migration/release smoke 全部通过。
- 每个 PR 绑定最新 head 完成 Codex Review，所有可操作线程闭环，CI 全绿且 mergeable 后才自动合并。
- 合并后部署必须通过迁移、seed、health/ready、公开 UAT 和 Docker cleanup；失败时停止并按现有回滚流程处理。
- 真人岗位、业务、财务、安全、技术和发布签署未齐全时，状态保持 `uat_pending` / `awaiting_human_gate`。

## 已确认产品决策

- 高风险前端动作纳入本轮，但采用逐动作后端就绪门；不以“已有接口”作为开放依据。
- 未通过五项就绪门的动作继续 fail-closed，不为追求表面完整而绕过审批、权限、幂等、审计或终态保护。
