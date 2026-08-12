# 集团公寓管理总体设计

## 审计结论

详见 `research/audit.md`。采用“独立公寓领域 + 复用公共基础”的方式：

- 复用 `asset_unit` 及园区/楼栋/楼层作为房号主数据。
- 复用 `biz_party`/用户作为入住人身份来源，但在申请和入住记录中保存必要快照。
- 扩展共享房源占用域，公寓入住生效时创建占用，退房完成时释放。
- 复用 `sys_file`、共享上传策略、审计日志、用户消息与幂等拦截器。
- 不复用商业 `biz_housing_lease`、应收、押金和账本，避免福利宿舍被错误建模为租赁合同。
- 审批首期采用公寓领域内可审计状态机和决定记录；预留接入通用审批策略的适配口，不直接耦合复杂的财务 Property Approval 执行器。

## Domain model

### Inventory

- `biz_apartment_room`: 关联 `biz_unit`，记录公寓类型、容量、性别策略、设施、管理状态；房间启用时持有一条整房 `apartment_room` 共享占用，阻止其他经营域使用。
- `biz_apartment_bed`: 床位编号、状态；单人公寓也创建一个默认床位以统一并发模型。

### Application and approval

- `biz_apartment_application`: 申请编号、入住人、人员类别、所属企业/部门/职务快照、入住原因、计划日期、状态、期望类型。
- `biz_apartment_approval`: 每次提交对应的审批批次和决定，保存审批人、意见、时间与申请版本。
- 默认流程：申请人提交 → 公寓管理员审查 → 有权限审批人批准/驳回 → 管理员分房。首期允许吴恩国同时管理与审批，但审计记录必须区分动作。

### Stay and documents

- `biz_apartment_stay`: 已批准申请产生的入住实例，绑定房间/床位；多人宿舍的并发由床位和日期约束处理，不为每个住户重复创建整房占用。
- `biz_apartment_handover`: 入住/退房交接快照、钥匙、物品、照片、异常及双方确认。
- `biz_apartment_document_template`: 文档类型、版本、状态、变量定义和正文/模板文件。
- `biz_apartment_document`: 某次入住冻结后的文件档案，保存模板版本、生成/签署文件、哈希和签署时间。

## State machines

- Application: `draft -> submitted -> approved|rejected|cancelled -> allocated -> checked_in -> checkout_pending -> completed`。
- Stay: `reserved -> active -> checkout_pending -> completed|cancelled`。
- Room/bed可用性由有效 stay + occupancy 投影得到，禁止仅靠可编辑状态字段判断。

## RBAC

- 模块：`apartment`。
- 页面：总览、房源、入住申请、在住人员、退房、文档模板/档案。
- 动作权限分为 read/manage/apply/approve/allocate/check_in/check_out/document_manage/audit。
- `APARTMENT_MANAGER` 具备全流程业务权限，但不自动获得系统、财务或商业住房权限。
- `APARTMENT_APPROVER` 只审批；`APARTMENT_AUDITOR` 只读脱敏档案；后续可增加 `APARTMENT_APPLICANT` 自助申请。

## Privacy and documents

- 身份证件、手机号、紧急联系人属于敏感字段，列表默认脱敏，附件受业务归属和权限校验。
- 文档模板发布后不可原位修改；新版本发布不影响历史入住文档。
- 正式 PDF/扫描签署件记录 SHA-256，撤销只能新增作废记录，不能覆盖原文件。

## Rollout and rollback

- 新增 forward-only migration，不修改已执行迁移。
- 先发布隐藏模块和角色，再导入真实房源，最后为吴恩国启用模块菜单并 UAT。
- 应用回滚可隐藏模块；数据库表和历史记录保留，不做破坏性回滚。
