# 精确来源5a54010b

apps/api/src/modules/hr/hr-rewards.service.ts: options含LIMIT500；categories依赖READ access，MANAGE-only返回空，新的case-options应按原manage资格独立限定范围。写入service已有原状态/类别/敏感字段/事务规则，继续保留。
apps/web/app/hr/rewards/HrRewardsClient.tsx: load将case+options Promise.all，一项失败清空全部；load依赖仅管理/读取布尔与page；createCategory/create/update form action结合mutate吞错误，需验证失败草稿丢失并改显式提交。细节附件权限和审批入口必须保留。
培训已发布5a54010b提供可复用搜索DTO、scope guard、必要审计和实际组件测试模式。新清单PR879尚在CI，独立实施基于本轮已fetch main5a；最终审查/提交前整合清单的最新main；只与shared hr-api/索引存在计划重叠，不覆盖。
