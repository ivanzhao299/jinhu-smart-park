# 设计

后端业务写路径负责未来数据完整性：在租户创建、登录授权更新及独立模块分配事务内，以 `biz_park` 为权威来源串行建立或恢复资产园区投影，并初始化与 production seed 同合同的 12 条 disabled runtime controls 和两轮共 24 条不可变修正审计。来源必须为同 scope 唯一有效园区；仅固定默认 scope 可以使用 production seed 已审查的全局唯一 `JH` 回退。重复来源、重复投影、部分 controls/audits 均在事务内 fail closed。启用 asset 时同步投影的基础园区字段；禁用模块不删除既有资产业务数据、runtime controls 或不可变审计。

该收敛能力是无反向服务依赖的共享事务 primitive。租户创建/授权、SaaS tenant-module assign/enable 与直接创建资产园区均使用相同的 tenant/park advisory lock；任一入口失败时模块 assignment、投影与控制初始化一起回滚。登录授权更新对所有非删除园区同步 `rel_tenant_module` 与 TENANT_ADMIN 的园区权限绑定，避免 inactive 园区保留旧授权；只有 active 园区可作为 canonical `biz_park` 来源并执行资产投影/控制初始化。

历史数据不由门禁直接修改。000194 classifier 新增严格的 `ready_missing_asset_seed_reconcile` 状态，条件是 final contract、000200 兼容成功、本次 seed=yes、完全不存在非删除 asset 投影、唯一同 scope biz source（或 000007 已定义的固定默认 scope + 全局唯一 JH 回退源）、controls/audits 全空。production seed 按既有顺序先运行 000007，再运行 000008，使投影与控制审计事务性收敛。已经产生完整 12 controls/24 immutable audits、但 asset assignment 后来被禁用/过期的 scope 作为 validation-only retained scope；租户随后过期不会把这段完整历史误判为 active scope 无效。诊断与 000008 对 active/retained 同时验证控制定义、两轮审计字段和 evidence exact-set，但不重新启用模块、不新建控制数据。active/retained scope 均要求恰好一个 enabled 且非删除投影，同时存在 disabled 非删除投影、未知 scope、partial controls/audits 或定义/审计漂移仍阻断。
