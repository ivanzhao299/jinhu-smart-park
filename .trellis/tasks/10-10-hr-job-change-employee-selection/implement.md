# 实施

1. API实现严格DTO、同现有范围的最小候选读取与审计；增加超过500名、搜索、跨范围/越界、DTO和审计失败测试。
2. Web增加明确API类型/方法，扩展共享选择器purpose并接入岗位变更受控表单；不改变其他purpose权限/行为。
3. 实现/check角色独立验证；API合同/隔离PG、岗位变更及共享选择器各原场景交互、类型lint构建、桌面/390px实际组件。
4. 清理本任务隔离数据库；PR927核验后fetch/integrate最新main、比例复验、PR/CI/顺序发布、健康与Docker清理及独立API/Web运行证据。

API implement角色仅负责hr-job-change服务/控制器/DTO及相关测试；父负责Web类型方法、共享选择器/面板/交互；check角色在实现结束后统一核验。保持其他工作树发布候选不变。
