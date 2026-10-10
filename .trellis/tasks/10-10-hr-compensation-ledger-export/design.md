# 设计

GET /hr/compensation/assignments/export，DTO仅keyword(可选trim/max100)、employeeId(可选UUID)，不使用page。controller与service均复用HR_COMPENSATION_READ及exactscope。response {items:HrCompensationAssignment[],total:number,snapshotAt:ISO timestamp}，items只用现有最小ledger投影。

服务端同一个REPEATABLE READ事务读取稳定顺序的最多5001行及快照时间，5001即报错，不返回部分；snapshotAt来自该事务数据库时间。可小范围抽取查询/投影复用以避免列表和导出筛选漂移，保持现有列表接口及返回形状。敏感读取审计以导出独立action/path、financial+compensation、park projection及itemCount，在return前必需成功。

Web复用既有LedgerContent中的导出入口与请求生命周期，并抽出compensation-ledger-export.ts作为严格校验/CSV白名单的单一责任模块；保持当前已执行筛选和refreshVersion/用户上下文绑定。读取一次快照，验证total==items.length且<=5000、唯一id、完整ledger投影、有效snapshotAt，CSV显式白名单复用csvDocument/downloadCsv。用已执行query.keyword而不是未提交search；输入有未提交变动时禁用/中止。捕获token、同步controller锁、render-time context fence+cleanup abort，跨账号/权限/筛选/刷新/卸载绝不下载。

文件名员工定薪台账.csv；提示为薪酬设置、最多5000条及超限缩小筛选；结果数量含0，不猜字段。按现有DS布局，按钮44px。无DDL/shared权限/依赖升级。

回退为应用版本回退，无业务数据库写入。本片原版报表布局和真实HR验收分开保留。
