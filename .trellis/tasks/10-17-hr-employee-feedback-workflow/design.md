# 技术设计

复用TenantParkScope、现有hr员工本人绑定、HR审批页面/本人管理/园区审核权限、HR敏感读取审计、原项目写入幂等机制与错误处理。不要发明新的认证基础设施。独立HrEmployeeFeedbackService/Controller与DTO注册HrModule，Shared类型导出通过现有index。

新增唯一编号前向迁移（先查当前最大编号），创建建议/投诉主记录及不可变动作历史。tenant/park/employee/actor使用现有实际类型与复合关系；定义类型suggestion/complaint及draft/submitted/answered/withdrawn/cancelled状态。draft编辑、submit、cancel；submitted本人withdraw或HRreply；其余终态仅回读。HRreply不得编辑原正文；动作历史保留正文修订/回复快照的需求由既有HR审计模式落实，不将正文写入公共日志。标题/正文/回复明确限长，后端验证与前端一致，不猜旧字段含义。

所有变更同manager事务、行锁、expectedVersion，规范现有幂等拦截器/数据库唯一约束与重放语义；不能把guard-only称为幂等。回复/撤回并发必须测试实际数据库。查询所有维度按租户园区和本人/HR权限限制，先权限再存在性探测；详情历史完整分页且无其他员工私密字段。

页面/hr/employee-feedback复用HR布局/PermissionGuard和现有auth context remount模式；无写权限不渲染写控件，服务器始终独立校验。本人和HR授权队列明确，HR身份可同时是员工但不通过UI扩大任何范围。加入现有HR导航/工作台实际入口，复用原权限而不扩张默认角色。渲染与数据导出不得泄露投诉到部门管理者；不新增CSV导出。以声明式状态和原请求键实现失败保留、写成功读失败分离。

回退仅应用回退；已成功迁移不修改，正式记录不删除。当前切片不改变独立HR组合根/现有工资流程。旧121/123/122/124只补目标技术锚点，legacyRuleParity/legacyRuntimeUat保持未证明，不给全等价完成信用。

## 实施冻结的细节

迁移376；HR队列只含submitted/answered/withdrawn，不含其他员工草稿/取消记录；HR不得回复本人绑定或本人创建记录。文本使用Unicode codepoints（120/4000/4000/1000，原因最少2字），完整换行保留、实际NUL拒绝。安全写回执仅id/version/status/actionId。372任意权限evaluator复用为SQL即时校验，不改历史函数/ACL；同事务required审计只写metadata，私密正文/原因仅业务history。Webadapter独立employeeFeedbackApi，不扩旧审批行为。
