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

## 原技能、证照完整集合恢复

`recoverCertifiedOriginalRecordSet` 是内部事务证明原语，仅支持静态白名单 skill/credential；它不是导入 endpoint，也不能单独授予来源接纳权限。目标 ID 和 `{count,sha256}` 必须来自已认证原 T5 receipt/owned_state，不能由客户端或当前业务记录生成。

调用方持有事务，按目标表、对应不可变变更表顺序加 SHARE 锁。未维护 v1 行使用当前快照；已维护行必须有 version2 的首个加密 before，恢复 v1 未删除原快照。允许当前记录已归档，但不恢复或改写当前业务行。原/current 的字段集合及 id、tenant、park、employee、原来源身份和行摘要必须一致。缺失首个 history、无法解密、版本不符或来源元数据改变均返回 `RECORD_ORIGINAL_SET_INVALID`。

完整集合通过 PostgreSQL `jsonb_populate_recordset` 重建真实类型，固定 Asia/Shanghai 序列化，以每行 SQL JSON 文本 SHA 排序聚合核对原证书；不以 JavaScript JSON 摘要替代 SQL 证书。无跨请求证书缓存，不修改已应用迁移。

`hr-record-maintenance.pg.spec.ts` 复用现有实际 PG/CI 入口，验证两域多行、未维护与维护/归档混合集合、证照加密编号原值、正常编辑后恢复、无业务写入、事务要求、范围/重复ID/证书/域拒绝、缺首个历史和来源元数据篡改。原操作/回执/owner认证见下一节；公共增量API/raw入口仍待连接和验证。

## 原来源及回执认证链

`hr-yuzhou-record-baseline.ts` 的 `originalExtendedRecord` 要求活跃调用方事务，仅选择 dbo.knowhow→skill、dbo.ticket→credential 两个静态领域。锁定原 T5 操作，验证 succeeded/未回滚、binding SHA和scope、原core/payroll parent、执行代码与mapping contract pin。关联来源/目标两份insert回执、同一数据库成功migration_batch、正式原来源元数据、原T0员工record/map/receipt/phase/batch和存续员工；拒绝重复归属。来源只解密并执行一次已知旧transport解码，重验完整原行摘要、source id稳定identity及person归属，不修复摘要。

`certifyOriginalRecords` 按原操作和领域在事务内核验整个不可变回执集合，再从该集合选择目标ID，调用原集合恢复原语。调用方只能使用服务端解析结果，不得直接把客户端构造的 OriginalExtendedRecord 当作认证结果。未来请求内cache须包含operation和kind；无跨请求复用。

`originalRecordSourceFacts` 复现pin原映射并与认证原目标逐字段比较：技能名称/原等级/备注，不编造proficiency或获得日期；证照类别空值沿用legacy、名称/颁发机构/日期/备注/受保护编号；无效日期或逆序有效期保留原null并注明pending；附件引用仅核验原摘要并pending，不形成关联。加密编号同时核对原值、掩码、指纹。未知kind、列缺失/类型/非法Unicode、原目标与来源事实不一致均拒绝。

`hr-yuzhou-profile-baseline.pg.spec.ts` 在已有原core ownership真实SQL fixture中追加两域独立小型合成T5操作，应用原000317和000338，测试原链、原transport、日期/附件pending、同一原集合的现代编辑/清空/归档及当前值守恒、错误scope、原操作rollback、兄弟receipt漂移、来源ciphertext篡改、inactive owner map和逐字段不相容。复用现有CI实际PG入口，不代表真实新批次或公共增量API已完成。

## 增量比较及加密账本准备

共享 `normalizeYuzhouRecordFields`/`planYuzhouRecordFields` 仅承接已确认的技能3字段、证照7字段。省略保留、显式null参与来源比较；必填文本、长度、Unicode、严格日历、编号掩码拒绝。来源未变保留现代编辑；来源改变且当前字段仍等于原目标基线才写；独立收敛仅接纳来源基线；分歧原子冲突；归档后来源改变返回RECORD_ARCHIVED。部分证照日期更新与当前省略日期合并校验，逆序返回RECORD_DATE_RANGE_INVALID。

前向000339准备skill/credential数据库域，不修改已应用迁移或业务原行。两域要求空明文field/target baseline、非空加密facts/baseline、固定来源及目标表、稳定source key、正版本；identity/scope/domain/target不能重绑、删除或版本倒退。独立skill/credential原基线表有目标/actor/原receipt FK、完整SQL插入binding guard及不可变provenance。SQL仅验证绑定与加密格式，API仍必须核验真实密文及原集合证书，不能以SQL插入成功替代认证。

共享导出和数据库域准备不启用公共API域。`hr-yuzhou-record-plan.spec.ts` 验证三方比较及边界；真实PG原链fixture应用000339，实测两域private baseline、NULL目标表防绕过、provenance scope/source/target/证书错配、不可变凭据、不可重绑来源/目标、不可删除及目标版本倒退，允许加密元数据正常推进，业务目标保持不变。公共preview/commit与raw入口仍待接入；内部事务执行器见下一节。

## 调用方事务执行器准备

`executeYuzhouRecordItem` 只处理skill/credential静态来源表及sha256身份，仍使用prepared item类型，未打开公共domain。调用方事务内分来源advisory锁、ledger行锁、原source/owner/receipt认证、按operation+kind缓存原集合证明、加密原provenance及字段比较。Owner变化冲突，原凭据不匹配拒绝；没有有效原证明却已有同源metadata目标时拒绝创建重复历史行。原ledger的事实与基线仅解密使用，不向revision暴露原值或编号。

新增使用 `createEmployeeRecordInTransaction`，与正常HrLifecycleService技能/证照创建共用DTO验证、独立权限、员工范围锁、protected number、v1快照和同事务create journal。更新使用已有mutate helper及当前版本CAS，不嵌套事务。未变来源保留现代修改；收敛只推进来源基线；归档冲突不复活。每次revision只含字段名、版本和结果。

真实PG原链fixture验证内部preview/create/update、相同来源重复运行、原基线首次接纳、分歧/收敛/归档、权限拒绝、journal失败时目标和ledger回滚及重试；真实竞争连接在观察之后现代修改触发CAS，ledger不变而现代修改保留；并发同源得到applied+unchanged及唯一create journal。既有maintenance PG和lifecycle契约回归通过。内部重复来源验证不证明公共同包重放；公共DTO/preview/commit/status、同包员工依赖、raw入口及生产发布仍须后续独立验证。
