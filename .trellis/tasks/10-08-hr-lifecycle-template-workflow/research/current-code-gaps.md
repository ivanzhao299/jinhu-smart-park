# 当前源码事实 main698

HrLifecycleClient createTemplate固定items:[一个任务]，页面action={createTemplate/createChecklist}；controller已有POST templates/:id/versions且TEMPLATE_MANAGE/idempotency/audit，service基于父template FOR UPDATE生成MAX+1。DTO最多50items、dueDays[-365,365]、required可选。listTemplates只READ/MANAGE，ASSIGN-only被拒。Webtypes摘要id/code/name/type/versionId/versionNo/itemCount，没有版本items读取与publishhelper。需要复用现有snapshot写法，不增加员工/工资状态变更。

培训PR878候选327261d正运行CI，由父session36486负责。此工作区main698。独立工作者只改本片文件；不要改培训/离职/导入/认证。提交前父同步最新main。
