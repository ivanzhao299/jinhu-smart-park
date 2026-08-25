# 统一民宿财务列表与详情 ledger 金额口径

## Goal

Issue #393 / GAP-FINANCE-01：finance 列表与详情统一使用 confirmed ledger 金额口径，并覆盖自动生成与手工入账混合场景。

## Requirements

- Finance workbench 列表与 booking 详情必须统一以 `confirmed` ledger entries 作为金额唯一口径。
- 列表 `totalAmount` 必须等于 confirmed `charge` 合计；`amountPaid`、`amountRefunded`、`amountWaived` 与 `balance` 必须使用与详情相同的 confirmed ledger 汇总公式。
- 手工 charge 只写 ledger 时，列表与详情不得再依赖同步更新 `booking.total_amount`。
- 保持现有 API 字段名、权限投影、分页与前端展示契约不变。
- 单元测试必须覆盖自动生成 room charge 与手工 charge/payment/refund/waiver 混合场景，并证明 registered/void 等非 confirmed 记录不计入汇总。
- 不修改生产数据，不引入 booking 与 ledger 的金额双写。

## Acceptance Criteria

- [x] Finance CTE 的 `totalAmount` 与 `balance` 均以 confirmed ledger charge 聚合为基数。
- [x] 列表的五项金额与详情 `ledger_summary` 公式一致：`balance = charges - payments + refunds - waivers`。
- [x] 自动生成 charge + 手工入账混合 fixture 的列表映射测试通过。
- [x] registered/void ledger 噪声不会进入任何金额合计。
- [x] 现有 finance workbench 查询、分页、字段白名单与金额格式化测试不回退。
- [x] API lint、typecheck、相关单测通过，PR Closes #393。

## Notes

- UAT 证据：`docs/uat/homestay-full-flow-uat-20260825-212435.md` 的 `GAP-FINANCE-01`。
- 本任务是单个 SQL 聚合口径与对应契约测试的轻量修复，采用 PRD-only。
