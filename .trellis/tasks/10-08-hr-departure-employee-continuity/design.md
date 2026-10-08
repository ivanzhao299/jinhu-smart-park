# 设计

复用既有离职授权条件和在职状态过滤；专用分页员工候选查询，参数验证 page/page_size/keyword，稳定姓名,id 排序、完整 count，默认小页、上限 100，参数化 SQL。兼容既有 options 的调用者和接口测试；如果新增员工接口则旧接口保持不变。交接仅权限账号候选需与后端 assertOperationScope 对齐，不以员工通用查询绕过离职权限。编辑绑定来源已有详情，不能伪造无权限选项；服务端仍校验。前端 controlled picker 支持 selected 已绑定详情、搜索分页、AbortController、防并发/stale，避免表单 action 失败自动丢草稿。保留现有审批状态、日期业务语义、幂等和清场审计。
