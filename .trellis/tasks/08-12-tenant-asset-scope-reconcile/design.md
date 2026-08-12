# 设计

后端业务写路径负责未来数据完整性：在租户创建、登录授权更新及独立模块分配事务内，以 `biz_park` 为权威来源串行建立或恢复资产园区投影，并初始化与 production seed 同合同的 12 条 disabled runtime controls 和两轮共 24 条不可变修正审计。来源必须为同 scope 唯一有效园区；仅固定默认 scope 可以使用 production seed 已审查的全局唯一 `JH` 回退。重复来源、重复投影、部分 controls/audits 均在事务内 fail closed。启用 asset 时同步投影的基础园区字段；禁用模块不删除既有资产业务数据。

历史数据不由门禁直接修改。000194 classifier 只新增一个严格的 `ready_missing_asset_seed_reconcile` 状态，条件是 final contract、000200 兼容成功、本次 seed=yes、完全不存在非删除 asset 投影、唯一同 scope biz source（或 000007 已定义的固定默认 scope + 全局唯一 JH 回退源）、controls/audits 全空。production seed 按既有顺序先运行 000007，再运行 000008，使投影与控制审计事务性收敛。disabled、模糊、部分或漂移状态仍阻断。
