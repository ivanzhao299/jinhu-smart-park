# EPDR Workflow Boundary

Task 001 仅保留 Workflow Runtime 接入边界。

Phase 1 需要为以下节点预留 `workflowInstanceId`：

- 工程立项审批
- 工程计划审批
- 验收审批
- 整改复查
- 项目关闭

如果现有 Workflow Runtime 能承接，则后续任务优先接入；否则先实现轻量 placeholder，保证未来可替换。
