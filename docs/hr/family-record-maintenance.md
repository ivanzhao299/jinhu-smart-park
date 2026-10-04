# 家庭成员正式维护

当前为本地候选：现代页面新增、编辑、移除入口与后端保存、软删除及加密变更记录已实现。真实独立 PostgreSQL 针对性验证通过；前端交互37/37、类型检查和针对性lint通过。CI全迁移链和生产角色验收仍未完成，不能视为生产已可操作。

沿用 `HR_EMPLOYEE_RECORD_MANAGE` 写权限。同范围员工必须存在且未删除；家庭成员必须属于该 tenant/park/employee。`GET /hr/employees/:employeeId/records` 的家庭成员增加 `version`，原有家庭敏感读取权限、自助脱敏投影及读取审计保持。证件号码不因可编辑而新增明文读取。

- `POST /hr/employees/:employeeId/records` 的 `recordType=family` 新增路径现在同事务记录加密快照，并返回 id、recordType 和 version=1。
- `PATCH /hr/employees/:employeeId/family/:familyId` 接收 expectedVersion 与实际修改字段。关系、姓名不可清空；可选字段省略保留，明确 null 清空。证件号脱敏占位符不能当新号码保存。出生日期只接受合法 YYYY-MM-DD 日期，布尔 false 不是省略。
- `POST /hr/employees/:employeeId/family/:familyId/archive` 接收 expectedVersion，设置 is_deleted，不物理删除。普通查询随后不再显示该成员；原行、来源身份和回执保留。

新表 `hr_employee_family_change` 按成员版本保存加密前后快照、动作及操作者，UPDATE/DELETE 被触发器拒绝。写入锁定同范围员工和家庭行，执行版本 CAS；并发旧版本返回409。新增、修改和软删除的快照写入失败均回滚业务变化。两个写入口复用真实幂等拦截器，审计装饰器不捕获请求正文。

本地数据库验证直接加载000252的四类档案表定义、000276档案字段和新000335；员工及账号依赖为最小合成表。覆盖双连接版本冲突、跨范围/跨员工/无权限拒绝、完整和本人脱敏读取、敏感字段省略、显式清空、加密快照、不可改写审计、三类写入的审计失败回滚及软删除读回。每次创建独立数据库并清理，容器仅映射loopback55495。不将这个局部数据库验证称为完整生产迁移链验收。

原始来源、source/map/receipts与T0–T5操作不重放或改写。本候选不实现新的家庭成员来源增量适配，也不导入未提供的七月以后批次；后续适配需保留现代修改并执行同字段冲突比较。

本地IAB验收使用合成数据：1440px桌面和390px手机完成实际修改、新增及移除回读，手机document.scrollWidth=390。捕获请求确认修改仅传workUnit和expectedVersion，未传证件或联系方式；新增和移除各一次。证据目录为本机/tmp/yuzhou-family-browser-proof，不能作为真实生产角色证据。
