# 技术设计
- 以 PR #263 role template/permission bundle/field matrix 为唯一权限来源。
- 为每个动作生成 readiness matrix；不满足者保留 fail-closed。
- mutation 使用稳定 idempotency key，展示 pending/approved/rejected/executed/conflict/terminal 状态。
- API 先做 scope，再应用 field policy；身份证、凭证等固定保护与策略取更严格结果。
- 核对住房 refund/deposit_refund 对 HOUSING_FINANCE_WAIVE 的共同门，必要时同步 shared、migration、role bundle 与 tests。
