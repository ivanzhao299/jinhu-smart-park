# 设计

GET /hr/performance-v2/reviews/:id/reward-evidence，复用evaluation.reviewFilter并在只读RR事务中核对可见评价、读取奖励依据和总数。投影冻结snapshot的caseCode/kind/occurredOn，返回sourceVersion/capturedAt，严禁原snapshot透传；损坏快照明确标记待核对且不崩溃。完成metadata审计后返回。

现代绩效卡片增加查看奖惩依据按钮；独立组件维护分页20和取消过期读取，避免干扰办理草稿。用户/园区上下文沿用父工作区key；切换评价key重建。独立关闭，不新增来源跳转或来源权限依赖。
