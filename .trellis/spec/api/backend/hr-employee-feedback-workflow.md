# 员工建议与投诉

现代业务设计；旧 Group Web 121/123/122/124 仅菜单路径证据，规则及真实角色 UAT 未证明。

## 合同与权限

`/hr/employee-feedback` GET context、列表、`:id` 详情、`:id/history` 历史；POST 创建、`:id/submit|cancel|withdraw|reply`，PATCH `:id`。列表及历史必须 view=mine|hr；分页 page>=1/pageSize1..100，默认20，列表可 kind/status 精确筛选。所有读取在当前租户园区及实时权限内，输出明确结构。

页面需要 hr:approvals，mine 需要 hr:approval:self_manage，hr 需要 hr:approval:park_review；team_review 不授权此功能。SQL复用372既有任意 permission evaluator，不改其实现/OID/ACL，不要求绩效权限。本人仅按当前非删除 hr_employee.user_id 绑定，不按姓名匹配；绑定歧义409、未绑定只读空列表和可见提示、禁止新建。园区 HR 无需员工绑定，不能回复自己绑定或自己创建的记录。HR只能看到 submitted/answered/withdrawn，不能探测其他员工 draft/cancelled。

创建 `{kind,title,content,reason}`，编辑另加 expectedVersion，状态动作 `{expectedVersion,reason}`，回复另加 reply。严格 DTO 禁额外字段。标题120、内容4000、回复4000、原因1000 Unicode codepoints，去除空白后非空，原因至少2字符，NUL拒绝，保留换行。服务端生成所有actor/time/actionID，写回执只有 `{id,version,status,actionId}`。Shared类型在 hr-employee-feedback.ts；Web独立adapter验证回执闭合shape。

## 数据与事务

376新建 hr_employee_feedback 和不可变 hr_employee_feedback_action；复合scopeFK、history链/version唯一、延迟head约束，更新必须version+1/newhead/currenttransactiontime。draft仅edit/submit/cancel，submitted仅withdraw/reply，answered/withdrawn/cancelled终态不可改。提交之后原正文冻结，回复不改变原文。历史存完整kind/title/content/reply/status快照及真实作者/原因/时间，仅经同范围私密接口回读。

行锁+expectedVersion阻止回复/撤回双成功。所有写入和 `AuditService.recordOperationRequired(input, manager)` 同一EntityManager事务；不要在这些路由加自动采集正文的AuditLog装饰器。公共审计只写ID/version/status/action和敏感读取metadata，正文/回复/理由仅业务历史。读取也执行required metadata审计。全局PermissionGuard、路由实时guard先于IdempotencyInterceptor，重放前重新校验当前权限及对象归属；真正DB幂等服务保留原键/请求摘要冲突语义。

## 页面连续性

新页面DS与390px记录卡、列表和历史完整分页。身份/园区/权限/token变化remount并清空私密状态；中止旧读取且忽略晚到写回。未知写结果冻结不可变原body/key/token/版本，单mutex重试；已知4xx保留填写内容。确认回执独立于读取成功，刷新失败保留回执，只重试读取。textarea按codepoints验证，HTML上限2倍以容纳astral字符，保留换行。
