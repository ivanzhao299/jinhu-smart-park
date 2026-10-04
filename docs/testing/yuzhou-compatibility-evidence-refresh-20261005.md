# 玉舟兼容证据链更新

基线为主分支 `6ecf72583efd1e35d3dfef7dc2de7ddcf6812abc`。本次只修复离线兼容证据链，不更改业务规则、权限、数据库或生产数据。

## 已审查的变更

- `t5-nonfile-field-projection.mjs` 相对原绑定版本只将 `structuredDate` 导出；技能转换未改变。
- 技能读取服务增加版本与稳定日期格式，创建改由 `createEmployeeRecordInTransaction` 执行。证据分别绑定实际读取服务和共用事务写入器，写入器摘要漂移或缺失均必须拒绝。
- M5 冻结清单的八处既有嵌套引用落后于已合并合同。七个合同相对清单基线仅更新证据摘要；员工资料任务另增加读取版本与过期写入 409 的断言。只更新这八个明确审查的引用，以及本次技能合同引用。
- 技能字段仍为四项已核对、五项分母；等级字典语义仍保留明确缺口。M5 仍为 `NOT_READY`，没有新授予兼容、业务验收或导入准入。

## 验证

```sh
node --test scripts/e2e/yuzhou-legacy-knowhow-field-map-contract.mjs scripts/e2e/yuzhou-legacy-frozen-compatibility-migration-manifest-contract.mjs scripts/e2e/yuzhou-legacy-compatibility-progress-v2-contract.mjs
node scripts/hr-cutover/legacy-compatibility-progress-v2.mjs --json
git diff --check
```

三组契约共 26 项通过，零跳过。进度汇总恢复执行，状态保持 `IN_PROGRESS`。反例继续验证错误摘要、缺失写入器、强行提高等级兼容分及不完整 M5 准入均被拒绝。

默认进度输入不包含外部生产回执；其中生产 `0/8` 表示未向本次离线汇总提供回执，不表示实际历史导入或生产发布失败。结构清点、字段映射、业务等价、页面任务、生产与真人岗位验收必须分别报告，不能把任一分数当作整个 HR 产品实现比例。

实际生产发布与原保险回执证明使用独立发布证据；首次保险基线接纳包已准备，正常生产登录与提交验收仍待完成。本次没有重复全源分析、A/B 或历史导入。
