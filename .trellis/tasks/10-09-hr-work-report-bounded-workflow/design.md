# 设计
GET /hr/work-reports/me/page 与 /team/page 返回items,total,page,page_size,summary{pending,returned}。沿用对应旧读接口精确权限；服务直接调用也按SELF_READ或TEAM_READ/REVIEW门控。查询固定每页20，支持report_type/status，计数和分页同一个REPEATABLE READ只读事务，稳定period_start/create_time/id降序，建议按当前页report IDs批量读取。计数与审计不暴露个人字段，空结果也审计。

Web新增类型和API方法，工作台按完整用户上下文key隔离。两个列表独立页/筛选/加载/错误，目标仅有SELF_READ时读取且为可选，主管缺少本人权限仍可审核。复用现有表单payload与permission、API写入/幂等服务，不复制状态机。提交成功清除编辑并保留成功状态，读取失败提示分开；页码收缩回退。无DDL、无RBAC修改。
