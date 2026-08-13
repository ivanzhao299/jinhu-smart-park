# 房产业务岗位权限配置产品化

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/262

基线：`origin/main` @ `dad3a11ad4221bd76377e4de1f4ee5c293932640`（已合并 PR #259、PR #261）

## Goal

把已存在的房产业务页面、API 权限与冻结权限包，产品化为普通岗位可安全开箱使用、可预览和维护、可绑定数据范围与用户的标准角色闭环；保持 maker/checker 分离、最小权限、作用域 fail closed、字段敏感性和生产审计可追溯。

## Confirmed Facts

- PR #259 已提供房源经营配置、统一占用、经营模式审计页面/API，并把 `property-bundle:property-asset-manager` 升级到 v2、18 项权限。
- 权限包存于 `sys_property_permission_bundle` 及成员表，以 definition version/hash 冻结；当前没有按 bundle 预览、创建或更新角色的 API/UI。
- production-safe Track-B reconcile 仅在固定 bootstrap tenant/park 中收敛权限、bundle 和 `SUPER_ADMIN` 授权，不创建普通岗位角色。
- PR #261 已补用户当前角色、合法候选、事务化替换、幂等审计及桌面/移动入口；仍需保护模板/系统角色、补足负向 PG/浏览器证据与会话即时生效契约。
- Track-B seed/migration 当前把 API 权限写为 `visible=true`、page 权限写为 `visible=false`；菜单消费者仅投影 visible 的 menu/page，API 鉴权不依赖 visible，因此该语义会隐藏页面但不会把 API 变成菜单。
- 数据范围和 `PropertyUnitAccessService` 已覆盖若干房产 API，但模板角色没有自动绑定 `current_park`；空 scope、维度无列映射及 scope/context 错配存在需要 fail-closed 复核的边界。
- 字段策略实际只对读响应的 `hidden/masked` 生效；`readonly/editable` 没有统一写入执行器。手机号、证件/身份资料由 `party:sensitive_read` 控制；金额动作主要由专门权限与审批控制。
- 现有 canonical bundle 已分别定义民宿财务与住房财务权限集合。为最小权限和业务域隔离，标准财务岗位采用两个模板，不提供默认合并财务模板；确需兼岗时由管理员显式组合两个 bundle 并确认差异。

## Requirements

### 标准角色模板

- 提供：房源经营管理员、房源经营审批人、民宿经办、住房经办、民宿财务、住房财务、房产业务审计七个模板。
- 模板不是 `SUPER_ADMIN`，maker 与 checker 权限集合互斥：经办/管理员不能决定其发起的审批，审批模板不含经营变更发起权限。
- 模板仅引用冻结 bundle/显式权限集合，固定版本与 hash，并可检测定义漂移。
- 审计模板默认只读；`party:sensitive_read` 从默认审计模板移除，仅通过明确标识的合规敏感审计变体/显式附加包授予。

### 生产安全 reconcile

- 使用新的前向 migration 与 production-safe seed/reconcile；不修改任何已成功历史迁移。
- preflight 必须唯一解析 tenant/park、目标 bundle、权限和受管标准角色；任一缺失、重复、跨 scope、状态异常或 hash 漂移均失败并回滚。
- 只收敛有固定受管标识/代码的标准模板，不覆盖用户自定义角色，不扩大未配置权限。
- 首次创建、同版本幂等重跑、受管角色升级、额外自定义授权保留/拒绝策略、停用与回滚审计语义均形成测试合同。

### 按权限包创建/更新角色

- API/UI 支持选择一个或多个 bundle 后预览最终权限、创建角色、更新受管角色和查看差异。
- 默认更新语义为安全合并：添加 bundle 缺失权限，保留角色额外权限；显式“同步为 bundle 集合”才允许删除额外权限，必须展示最终集合及删除项并二次确认。
- 请求携带 bundle code/version/hash、目标角色版本和幂等键；并发或版本漂移返回稳定冲突，不做部分写入。
- 所有写入要求专门角色管理权限、事务、作用域校验和审计；预览与提交使用同一服务端规范化器。

### 数据范围

- 标准模板默认 `current_park`，落地为当前 tenant + 当前 park 的明确 role scope/data-scope 关系。
- 跨园区审计必须由拥有相应管理权限者显式授权；不得默认 `all_parks`。
- 空 scope、未知维度、缺失映射、跨 tenant/park 或 building/floor/unit 越界必须拒绝或返回空集合，不得退化为 unrestricted。

### 字段与动作权限

- 默认岗位不得读取住客/租客完整手机号、证件号码或身份资料；只有显式合规敏感角色可获 `party:sensitive_read`。
- 经办可见完成业务所需的最小摘要；审批人仅见审批决定所需摘要，不获得身份资料写权限或经营变更发起权限。
- 财务读取、登记、减免/退款等高风险动作分别由显式权限控制；字段策略负责读投影，动作 DTO/服务校验负责写入，文档和测试不得把 `readonly/editable` 误称为已统一执行。
- 若本任务不新增字段策略执行器，必须用契约测试固定上述边界和明确残余能力，不留空白结论。

### 用户角色分配与 visible

- 基于 PR #261 保留“替换全部受管 tenant/park 角色”的明确语义和保存前最终集合预览；不得删除 platform、system/builtin 或其他非受管链接。
- 候选排除跨 scope、停用、删除、platform、不可直接分配的模板角色；模板必须先实例化为普通角色。
- 角色/权限更新后，现有 token 的下一次请求须从 DB 重算并生效；离线/客户端缓存不得继续展示或允许已撤销能力。
- Track-B page/menu 权限 `visible=true`，API/action 权限 `visible=false`；权限树可展示授权配置项但动态菜单只投影可见 menu/page。

## Acceptance Criteria

- [ ] 七个标准模板的权限、bundle 版本/hash、maker/checker 分离及默认 current_park 范围有冻结测试。
- [ ] 财务拆分决策记录为民宿/住房两个模板，显式兼岗组合不静默扩大权限。
- [ ] 新 migration 与 production-safe reconcile 在空库和升级路径通过；双历史/checksum 正常，重复执行幂等，定义/范围漂移 fail closed。
- [ ] reconcile 不修改用户自定义角色和额外授权；受管角色升级/停用/审计/回滚语义可验证。
- [ ] bundle 预览、创建、合并更新、显式同步、差异展示、版本冲突、幂等重放/冲突和事务回滚均通过 API 与 UI 测试。
- [ ] 空/跨 tenant/park/building/floor/unit scope 非泄露式拒绝；审计跨园区必须显式授权。
- [ ] 手机号、证件/身份、财务金额与审批摘要的字段/动作矩阵有自动化测试；默认审计角色不含 `party:sensitive_read`。
- [ ] 用户角色页面展示当前/最终角色集合，排除非法候选并保护 platform/system/builtin/模板链接；桌面及 390px 无横向溢出。
- [ ] visible 契约矩阵证明：page/menu 可进入动态菜单，API/action 不进入菜单，API 授权不受 visible 影响。
- [ ] 非超级管理员本地真实 Chrome 覆盖七个岗位正向菜单/页面/动作与负向 maker/checker、缺页/缺动作、跨 scope、停用/更新/换号缓存场景；无法执行真实 Chrome 时提交 Windows 交接且门禁保持 BLOCKED。
- [ ] shared build/test；API lint/typecheck/unit/相关 PG；Web lint/typecheck/build/组件与菜单；release-smoke、相关 first-release E2E、`git diff --check`、Trellis check 全部通过，或逐项记录跳过原因和残余风险。

## Out Of Scope

- 不访问生产 URL、账号、秘密或数据；不部署、不声明 `production_ready`、不代替真人岗位签署。
- 不允许普通管理员创建/分配 platform 或 `SUPER_ADMIN` 角色。
- 不在本任务建立通用 ABAC/字段级写策略引擎；若证据要求扩大到该层，先回到规划并单独评审。
- 未经本任务后续明确授权，不 push、不创建 PR、不合并。

## Open Questions

- 无阻塞产品问题。默认采用“财务模板按民宿/住房拆分”和“bundle 更新默认安全合并、显式同步才删除”的最小权限方案；如用户希望不同产品策略，需在实施前调整本 PRD。
