# 正式员工扩展档案维护

## 契约

- 经验、技能、证照不区分历史或新建来源。已有 version 返回读接口；更新/归档要求 expectedVersion，范围绑定 tenant/park/employee/id。
- PATCH /hr/employees/:employeeId/{experience|skill|credential}/:recordId 和 POST 同路径 /archive 要求 HR_EMPLOYEE_RECORD_MANAGE、IdempotencyInterceptor、captureBody:false；Service 独立权限校验。
- 省略保留字段；显式 null 仅清除可空值，名称/类别/开始日期不能为空。日期是严格 YYYY-MM-DD，合并旧值后校验结束不早于开始。
- 证照编号未提交时保持原密文；显式 null/空串同步清空密文、掩码、指纹。禁止把掩码作为替换编号。
- 同事务员工锁、目标锁、版本递增、加密 before/after 追加记录；新增同事务追加 create。变更写入失败，目标写入回滚。
- 归档仅 is_deleted=true，不删除数据；源身份、源行 hash、原导入回执不变。既有导入记录无 create 变更也允许从 v1 正常维护，首个 update 保存原完整 before。
- 迁移000338仅创建追加式变更表、索引、FK及不可变触发器，不更新业务历史数据。
- Web 通过 HrExtendedRecordMaintenance 和 HrExtendedRecords 接入，同一员工范围捕获使晚到响应失效。未知/无效版本不允许维护；掩码不作为编号草稿。使用 ds-panel、ds-scene-card、form-field 和既有响应式表单布局。页面技术验收不能替代生产真实角色业务验收。

## 验证

- 独立 PostgreSQL 专用新数据库 template0；实测并发 CAS、跨租户/园区/员工拒绝、字段保留、日期和掩码错误、清空编号、创建/更新失败回滚、软归档、不可变变更记录以及已有来源记录正常编辑。结束删除专用库并验证无残留。
- DTO allowlist/空值/版本/真实日期测试，相关家庭维护和 lifecycle 契约回归，API lint/typecheck。
- 发布前仍需 Web 类型/页面交互、桌面/390px、CI完整迁移及生产证据。
