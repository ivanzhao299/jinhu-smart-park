# 历史合同与现代办理衔接只读统计

本工具在既有 `diagnose-yuzhou-private-import` 诊断中追加
`database.contractSuccessorImpact`，用于确认历史 `active` 合同对现代合同办理的潜在影响。
工具分支仅用于只读诊断，不作为应用发布基线，不重放导入，不修改合同状态。

## 统计口径

- 严格使用已绑定租户、园区；员工及合同均排除软删除。
- 当前业务范围为 `preboarding/probation/active/suspended`，不是核实后的在岗人数。
- 业务日期取生产数据库的上海时区日期。
- 返回当前范围员工数、历史 active 合同数及对应员工数；历史合同按结束日期早于观察日、当天或以后、日期缺失三组数量守恒。
- 另统计含历史合同的多 active 合同员工数，以及同时存在现代 draft/active 合同的员工数。
- 不返回员工编号、姓名、合同编号或其他个人行；日期缺失不推定为已到期。
- 数量仅证明代码阻断条件的潜在范围，不代表用户实际办理失败或真实岗位验收。

## 执行与证据

运行前检查工具候选 SHA、仅含本工具的 diff，以及
`node --test scripts/e2e/yuzhou-private-import-readonly-audit-contract.mjs`。
使用保留的受控输入绑定，强制工作流模式为 `diagnose-yuzhou-private-import`。
诊断保持数据库只读连接及只读事务，校验目标身份、原导入状态及数量守恒；失败即停止。
工作流和受控输入均不修改。不得选择 prepare/execute 模式。

下载 `yuzhou-private-readonly-audit` 聚合证据，保存在私有目录并记录观察时间、工具 SHA、运行 ID。
工具 SHA 与应用运行 SHA 分别记录，不能互相替代。生产 SQL 和实际数量只有该运行成功后才算验证。
本工具不完成合同续签规则、真实角色或整个 HR 产品验收。
