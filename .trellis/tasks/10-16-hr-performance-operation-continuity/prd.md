# 绩效办理原请求重试与成功回执连续性

## Goal

让 HR、主管和员工在现代绩效页面中连续完成创建、发布、评价、校准、签收及申诉；网络回应丢失后重试同一请求，不重复创建或办理。属于既有现代化长任务 S5，不替代旧端规则等价或真实岗位验收。

## Requirements

- 保留未成功表单，所有本页幂等写接口重试复用原请求内容、账号上下文和请求编号。
- 结果不确定期间只允许重试原请求，不允许切换记录、修改内容后发起另一写请求。
- 已收到真实成功回应后显示成功；后续刷新失败仍保留成功凭据，不重新执行写入。
- 明确业务拒绝后允许修改草稿；账号、园区或权限切换取消旧状态和旧响应。
- 现有权限、独立复核、状态及分数校验均沿用；不改 API 规则、数据库或导入。

## Acceptance Criteria

- [ ] 创建周期/校准会、发布、评价、校准、签收和申诉全部沿用可重试的请求编号。
- [ ] 真实组件测试证明回应丢失重试 key/body 相同、成功后刷新失败不重写、双击单次、明确拒绝可修改、上下文切换无旧响应污染。
- [ ] Web lint/typecheck 和相关既有绩效测试通过；桌面和390px实际组件浏览器验证。
- [ ] 经检查提交并按既有串行发布链路集成，生产运行证明与真人验收分别记录。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
