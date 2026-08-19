# 修复房源新增归属园区选择闭环

GitHub Issue: #312

## Goal

修复资产管理 - 房间/房源管理页面“新增房源”时无法选择归属园区的问题，沿用楼层管理已验证的园区上下文切换闭环：表单选择目标园区后，前端切换认证上下文，重新加载目标园区楼栋/楼层，再使用新上下文提交房源创建。

## Requirements

- 新增房源抽屉必须提供“所属园区”选择，候选来自当前用户启用的可访问园区。
- 新增房源选择非当前园区时，必须先调用上下文切换，发布新会话后再加载楼栋/楼层候选和提交 `POST /park-units`。
- 房源创建请求体不新增 `parkId`，保持后端以当前 JWT `tenantId/parkId` 作为写入归属的契约。
- 切换园区后必须清空旧园区楼栋/楼层选择和筛选条件，避免旧园区候选残留。
- 列表页需要支持查看园区切换，使保存成功后能在目标园区列表中看到新增房源。
- 切换失败必须在页面/表单内可见，不继续提交业务写入，不误清会话或关闭抽屉。
- 覆盖同类风险：房源页不能在新增时默认拿旧候选第一栋/第一层。

## Acceptance Criteria

- [ ] 新增房源表单可选择当前用户可访问的启用园区。
- [ ] 选择目标园区后，楼栋/楼层候选刷新为该园区数据，旧园区候选不残留。
- [ ] 保存新增房源前若目标园区不是当前上下文，先完成 `switchParkContext`，再提交 `POST /park-units`。
- [ ] `POST /park-units` 请求体不包含 `parkId`，并由后端当前上下文写入目标园区。
- [ ] 新增成功后列表切到目标园区并刷新；刷新失败只提示“保存成功但刷新失败”。
- [ ] 本地单测、类型检查、lint、相关 e2e 静态检查通过。
- [ ] 提交前使用 Chrome DevTools MCP 做本地浏览器自测，或明确记录无法连接/无法完成的原因。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
