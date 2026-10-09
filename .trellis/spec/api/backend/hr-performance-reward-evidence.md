# 现代绩效奖惩依据

## 业务目的
复用 publishCycle 的 freezeEvidence 既有正式奖惩快照，补齐评价者和本人查看业务依据的能力；不另建旧 hr_performance_plan 关联。

## 路由与范围
GET /hr/performance-v2/reviews/:id/reward-evidence。沿用 HR_PERFORMANCE_READ / TEAM_READ / SELF_READ；请求scope与actor一致，UUID路径、严格标量page/page_size；服务复用reviewFilter的园区、主管组织树和本人范围，范围外404。

## 读取一致性
REPEATABLE READ只读事务内核对评价可见性并读取count和有序页，source_type限定reward，tenant/park/review全部绑定，页外仍返回完整total。

## 投影
仅返回冻结的caseCode、kind、occurredOn、sourceVersion和capturedAt；不透传原JSON，不连接来源当前金额、原因、附件。损坏历史字段投影null并在页面明确待核对；数组/对象不能穿透字符串字段。

## 审计
完成现有metadata-only敏感读取审计再返回，失败关闭读取；不记录业务值。

## 写入边界
本入口只读，不改奖惩、绩效分数、历史快照或权限。原评价、校准、签收、申诉流程维持现有动作。

## 验证
scoped服务/DTO/controller与独立PG完整43条分页、组织树、本人、范围外及并发快照测试；原完整生命周期PG另有基线，不把最小投影fixture称为全业务验证。
