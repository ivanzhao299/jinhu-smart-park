# 员工经历、技能与证照维护

员工档案页提供三类正式记录的新增、编辑及归档。已导入和后续新建记录使用同一维护路径，按现有 `hr:employee_record:manage` 管理权限操作。完整证照编号读取仍需要 `hr:employee_credential:read`。

编辑仅提交修改字段；未修改编号不重新加密，缺少完整读取权限时空白编号不代表清空。清空需显式勾选。保存冲突或结果未确认时保留草稿并要求重新加载核对，避免重复写入。归档保留原行和追溯关系。

数据库已有 version 列。000338 前向迁移仅增加经验/技能/证照的加密追加式变更记录、范围 FK 和不可变触发器，不改写原历史业务行。读接口日期统一为 YYYY-MM-DD。新增接口保留原 URL，与变更记录同事务，并支持技能业务等级。

接口：`PATCH /hr/employees/:employeeId/{experience|skill|credential}/:recordId`；归档使用相同 URL 后加 `/archive` 的 POST；要求 expectedVersion。新增仍用 `POST /hr/employees/:employeeId/records`。写接口均保留幂等拦截器和不捕获请求正文的审计。

CI 的 HR PostgreSQL 任务在专用库中运行 `hr-record-maintenance.pg.spec.ts`，验证版本并发、权限和员工范围、密文保留/清空、新增及修改失败回滚、软归档和已导入记录正常编辑。Web HR 回归包含仅提交修改字段的测试；页面需桌面及实际390px验收。

本改动补齐正式档案维护；这三类的后续旧系统源文件增量映射、证照历史附件解析、生产真实角色验收及独立 HR 产品验收仍需对应证据，不据此声称整个 HR 功能复现完成。
