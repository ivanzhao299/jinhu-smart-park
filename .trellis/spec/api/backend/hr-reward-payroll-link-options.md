# 奖惩工资输入候选

## 目标
为已批准奖惩关联正式考勤工资输入，提供同员工的业务标签、版本和完整分页。

## 入口
GET /hr/rewards/cases/:id/payroll-link-options：必须同时具有 HR_REWARD_READ、HR_REWARD_LINK_PAYROLL，actor tenant/park 与请求一致，UUID 路径和严格 page/page_size DTO。

## 查询
REPEATABLE READ 内核对事项 approved，读取已有关联、有效输入候选和总数；item/batch/period 均绑定 tenant/park，item 同 employee 且未删除，batch effective 且未删除。只返回月份、批次、版本，不返回工资值或考勤计数。

## 保留引用
已有关联不受当前目标有效性限制；目标不可读取时标签为 null，原 target/version/status 仍返回。唯一追加引用不得覆盖或物理删除。

## 写入
复用现有 links 幂等路由；服务核对 scope、目标类型及精确权限；锁 approved 事项，校验同员工、版本、有效批次并共享锁定 item/batch/period；唯一冲突转409。不修改下游工资数据。

## 读取审计
必须完成 metadata-only sensitive read 审计后返回，禁止把候选值写入审计；审计失败不返回数据。

## 验证
对应 service/DTO 单元测试及独立 PG 实际追加约束、并发、快照、43条分页测试；现代绩效模型关联另行实现。
