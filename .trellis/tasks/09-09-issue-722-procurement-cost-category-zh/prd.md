# Issue 722 采购成本分类中文化

## Goal

采购成本分类在列表、详情和创建表单中使用 #536/#537 的共享中文 label 体系，不向用户显示 `repair` 等内部码。

## Contract

- `cost_category` 是开放字符串值域，不改变 API、DTO 或数据库约束。
- 仓库现有标准值 `consumable`、`supplies`、`repair` 在 shared 提供穷尽标签。
- 租户启用的 `housing_purchase_cost_category` 字典项覆盖标准标签并补充开放值。
- 未知值显示“其他采购成本”，空值显示“未设置成本分类”，不得回退原码。
- 表单展示中文选项、提交 `itemValue`，不提交中文 label。

## Acceptance criteria

- [x] shared 标准值与 label key 完全一致。
- [x] 列表、详情、表单均接入同一 formatter/dict loader。
- [x] 契约证明标准值中文化、租户覆盖生效、未知值不泄露原码。
- [ ] 定向 shared/Web 测试、lint/typecheck/build、review、CI、squash merge、main 门禁通过。
- [ ] #722 关闭，Trellis 归档。
