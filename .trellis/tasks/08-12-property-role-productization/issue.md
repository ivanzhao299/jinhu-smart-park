## 背景

PR #259 已补齐房源经营配置、统一占用和经营模式审计页面/API，PR #261 已补用户角色分配入口；但冻结权限包仍不会自动形成普通岗位角色，也没有按权限包预览、创建、更新、漂移和数据范围闭环，导致非超级管理员不能开箱使用房产业务能力。

本 Issue 以 `origin/main` commit `dad3a11a` 为基线，只在隔离本地环境实现和验收，不访问生产。

## 产品决策

- 标准岗位提供：房源经营管理员、房源经营审批人、民宿经办、住房经办、民宿财务、住房财务、房产业务审计。
- 财务按民宿/住房拆成两个模板，兼岗必须显式组合，避免默认跨业务域扩权。
- maker/checker 分离；审批角色不含经营变更发起权限，经办角色不含决定权限。
- bundle 更新默认安全合并并保留额外权限；只有显式“同步为 bundle 集合”、展示删除差异并确认后才可删除额外权限。
- 模板默认 `current_park`；跨园区审计必须显式授权。
- 默认审计模板只读且不含 `party:sensitive_read`；敏感身份读取仅授予明确合规角色。

## 范围与验收

### 标准角色与生产 reconcile

- [ ] 七个模板具有冻结 bundle/version/hash、最小权限、maker/checker 与 current_park 数据范围合同；
- [ ] 使用新前向 migration 与 production-safe seed/reconcile，不修改已执行迁移；
- [ ] scope 唯一性、权限集合/hash、predecessor 升级和漂移检查 fail closed；重复执行幂等；
- [ ] 不接管用户自定义角色，不扩大未配置权限，明确受管角色升级、停用、回滚与审计语义。

### 按权限包创建/更新角色

- [ ] API/UI 支持 bundle catalog、预览、创建、更新与差异展示；
- [ ] merge 默认保留 extra，sync 显式确认删除集合；
- [ ] bundle/role 版本漂移返回稳定冲突；所有写入有权限、事务、幂等、审计和 scope 约束。

### 数据与字段权限

- [ ] 空 scope、跨 tenant/park、building/floor/unit 越界均非泄露式 fail closed；
- [ ] 手机号、证件/身份、财务金额/登记/减免与审批摘要形成明确可测试矩阵；
- [ ] 审批人只读必要摘要，审计默认只读，敏感读取不被模板自动扩大。

### 用户角色与 visible

- [ ] 基于 PR #261 展示当前及保存后的最终角色集合，排除模板、跨 scope、停用、platform/system/builtin 非法候选；
- [ ] 替换语义不删除 platform/system/builtin/其他非受管链接；角色更新后已有 token 下一请求和客户端菜单/离线缓存即时收敛；
- [ ] 修正 Track-B `visible`：menu/page 可见，API/action 不进入菜单；权限树与动态菜单消费者契约一致。

### 质量与本地浏览器

- [ ] shared build/test；API lint/typecheck/unit/PG；Web lint/typecheck/build/组件与菜单；migration 空库/升级/双历史/checksum；seed 双跑/漂移拒绝；release-smoke 与相关 first-release E2E；`git diff --check`、Trellis check；
- [ ] 使用仅本地隔离 PostgreSQL/API/Web 和七类非超级管理员账号，在真实 Chrome desktop/390px 验收正向和负向、跨 scope、停用/更新/换号缓存；
- [ ] 若当前宿主不能执行真实 Chrome，形成 Windows 交接且浏览器门保持 BLOCKED，不以 API、Playwright 或静态测试冒充。

## 约束

- 不访问生产 URL、账号、秘密或数据；不声明 `production_ready` 或代替真人岗位签署；
- 不使用 `SUPER_ADMIN` 作为岗位模板；
- 未经后续明确授权，不 push、不创建 PR、不合并、不部署。

## Trellis

- Task: `.trellis/tasks/08-12-property-role-productization`
- PRD: `.trellis/tasks/08-12-property-role-productization/prd.md`
- Design: `.trellis/tasks/08-12-property-role-productization/design.md`
- Implement: `.trellis/tasks/08-12-property-role-productization/implement.md`
