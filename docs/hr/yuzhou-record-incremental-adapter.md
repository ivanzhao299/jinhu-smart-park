# 技能、证照固定来源适配器

无需等待全部 HR 功能完成。已覆盖领域使用现有 [固定文件入口](./yuzhou-reusable-import.md) 构包，再进入 `/hr/imports` 预览和提交。同格式新批次复用已审定的映射与异常决定；每批仍自动检查来源格式、摘要、关联、权限、幂等和现代同字段冲突。

`scripts/hr-cutover/yuzhou-record-incremental-projection.mjs` 固化原 T5 的技能、证照映射，导出 `verifyExtendedRecordSource`、`projectYuzhouExtendedRecord` 和 `YUZHOU_RECORD_FIELD_COVERAGE`。该底层 projector 返回 `candidate_only`，由统一构包入口的 `recordRecords` 转换为技能/证照 DTO。公共增量服务已接入两域并通过本地真实 PostgreSQL 的合成数据测试；这些改动尚未生产发布，不能将底层候选文件直接上传作为 API 数据包。

| 来源 | 已固定字段 | 保留待处理事项 |
| --- | --- | --- |
| `dbo.knowhow` | knowhow → skillName；grade → legacyGrade；memo → note | 不把原等级推断成 proficiency，不编造 acquiredDate |
| `dbo.ticket` | tickettype → credentialType；ticket → credentialName；ticketno → credentialNumber；org → issuingAuthority；getdate → acquiredDate；validdate → validTo；memo → note | ticketfilename 只保留摘要及待关联状态，不创建附件关联 |

证照类型为空时沿用原已执行转换的 `legacy` 值。日期复用原日期前缀语义，拒绝非法日历日期、0000 年和早于获得日期的有效期；异常日期省略并注明 pending，不以 null 清空现代日期。来源号码为掩码时同样省略并注明 pending。真实的 null 仍是显式空事实，后续必须通过可信基线比较才允许清空目标。

行校验复用 `readT5RetainedSource`，验证原行摘要、稳定来源身份和一次明确的旧传输解码，不重算摘要使篡改内容通过。员工关系使用已验证 `dbo.person` 来源索引，不能按姓名猜测。新增非空未映射列要求对新增部分核对，不能静默忽略。

2026-10-04 保留原文件离线核对：技能 6 行形成 6 条候选；证照 237 行形成 234 条候选、3 行未通过字段校验；员工依赖索引验证了 2949 条来源身份。候选数量吻合此前正式记录数量，但数量相等不证明原异常决定或目标对应关系。原隔离回执尚须服务端认证，不能自动补入这 3 行。此核对没有写生产，也没有接收七月份以后的新批次。

接入顺序：认证原 T5 来源/回执/目标初始基线 → 建立来源增量账本与逐字段三方比较 → 接入事务执行器和同一构包入口 → 验证重放、并发、现代编辑及归档保护 → 发布及真实批次验收。每个已完成领域可以独立启用，不必等待考勤、社保、工资等全部模块完成。

内部基线恢复原语 `hr-record-original-set.ts` 已以真实 PostgreSQL 验证：正常修改、清空证照编号及归档后，恢复首次加密 before 并核验完整原集合 SQL 摘要；当前业务行不变。`hr-yuzhou-record-baseline.ts` 已连接原操作、来源/目标回执、原T0员工归属及原映射认证，并完成两域实际PG链路验证。增量账本、逐字段比较和内部事务执行器的验证见下文；公共增量服务已在本地接入，生产尚未开放。

增量逐字段比较 `hr-yuzhou-record-incremental.ts` 与前向迁移000339已准备并通过合成比较/实际PG约束测试。来源未变保留现代编辑，独立收敛只推进来源基线，同字段分歧原子冲突，归档后不接纳变化；账本和原凭据仅保存加密事实，固定身份及归属不可变。000339尚未生产执行，公共服务已在本地接入；生产入口仍待发布验收。

内部事务执行器 `hr-yuzhou-record-executor.ts` 已完成实际PG验证，并与正常技能/证照创建共用事务写入。测试证明重复来源不重复创建、并发同源一次更新一次未变、人工同字段分歧/收敛、归档保护、观察后现代修改的CAS冲突，以及journal失败时业务记录和账本一起回滚。公共domain、DTO/preview/commit/status及同包员工依赖已完成本地真实PG验证；固定文件入口已连接并通过契约测试。原3行异常回执精确复用、页面和生产验收仍未完成，不能把本地测试当作接口已上线。

2026-10-04 11:02 UTC 的已保存生产只读取证显示，证照原隔离回执为 `SOURCE_MATERIALIZATION_QUARANTINED` 共3条，其中历史候选1条、当前影响2条、旧未结账期潜在依赖1条（重叠计数）。此为已保存时点证据，不是持续实时状态；仍需逐来源摘要证明候选失败的3行与原回执精确对应。不能以此宣布历史隔离最终归档或补入完成。

验证：`node --test scripts/e2e/yuzhou-record-incremental-projection.contract.mjs`，覆盖固定映射、非法/逆序日期、掩码、文件引用、摘要/传输篡改、结构漂移、错误关联和稳定身份。离线转换测试不替代公共 API、真实 PostgreSQL 或生产业务验收。

## 固定入口及当前验收边界

统一 CLI 的可选 `recordRecords` 数组接收经摘要校验的 `dbo.knowhow`/`dbo.ticket` 来源行；既有 `employeeIndex` 或同包 `employeeRecords` 提供确切员工依赖。使用现有版本化 recipe，摘要绑定 projector 和共享字段规则文件。来源/配方不变时事实 digest 不变，按员工依赖排序并复用2000条/8MiB分批。每个包依序预览、提交和核对，不保证跨包原子性。

构包只确认离线字段适用，不能授予服务端准入。API在事务内认证原来源、回执、原目标基线或新来源，检查权限、幂等、现代修改及归档。必填字段、来源结构/摘要或员工关联错误时构包失败，不能自动丢弃异常行；原3条证照异常须先与原回执逐来源摘要匹配。非法日期、掩码和附件关联保留为明确pending，省略字段不清空现代值。

本地公开服务验证包括首次原记录接纳、同包提交重放、相同事实再次预览、只读领域结果查询与提交拒绝、同包新员工关联创建。固定构包契约验证原输入不变、digest与协议一致、提取日期/顺序变化保持事实稳定、异常省略、来源漂移/重复/缺owner拒绝及跨2000条分批守恒。合成数据测试不代表新真实批次已经导入。
