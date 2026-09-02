# Implementation Progress

## Dependency

PR2 合入 main 双绿后，从最新 `origin/main` 创建 `codex/fix-hcd-temporary-labels-uat`。

- [x] 盘点值域/dict code 并确定行业惯例临时中文。
- [x] shared 常量、注释、测试与 Web 接线。
- [ ] 27 路由桌面/390px 与主链 UAT。
- [ ] 成熟基建、trellis-check、PR、CI、merge、main 双绿。
- [ ] 归档并终报。

## Validation Log

- PR2 #537 已 squash merge 至 `main@c9177120`；main CI 与自动部署均 success。
- 三路只读盘点完成 HCD-005/007、015/028、026/030 的生产者、消费者和值域证据。
- D 类临时定名集中于 shared，并标注“临时定名待产品确认”；retention 仅入目录，未虚构 Web 页面。
- 开放住房费用/支付加载 `housing_charge_type` / `housing_payment_method` 的 enabled `/dict-items`；失败/无配置退回平台临时中文，表单提交仍为原始值。
- PASS shared build + 36/36；Web property 33/33、housing 33/33、homestay 18/18；Web typecheck；Web/shared lint；`git diff --check`。
- 首轮复核修复审批/运行时旁路的 raw action/status/source、Identity 证件类型/终态选项与机器错误码。
- 第二轮最终复核无 P0/P1；修复唯一 P2：运行时审批原因 `aria-label` 改用中文审批动作，并补静态回归断言。
