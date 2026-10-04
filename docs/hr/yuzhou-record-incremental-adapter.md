# 技能、证照固定来源适配器

无需等待全部 HR 功能完成。已覆盖领域使用现有 [固定文件入口](./yuzhou-reusable-import.md) 构包，再进入 `/hr/imports` 预览和提交。同格式新批次复用已审定的映射与异常决定；每批仍自动检查来源格式、摘要、关联、权限、幂等和现代同字段冲突。

`scripts/hr-cutover/yuzhou-record-incremental-projection.mjs` 固化原 T5 的技能、证照映射，导出 `verifyExtendedRecordSource`、`projectYuzhouExtendedRecord` 和 `YUZHOU_RECORD_FIELD_COVERAGE`。它目前返回明确标为 `candidate_only` 的候选事实，**尚未接入公共增量 API 和固定入口**；不能把候选文件当作生产可提交数据包。

| 来源 | 已固定字段 | 保留待处理事项 |
| --- | --- | --- |
| `dbo.knowhow` | knowhow → skillName；grade → legacyGrade；memo → note | 不把原等级推断成 proficiency，不编造 acquiredDate |
| `dbo.ticket` | tickettype → credentialType；ticket → credentialName；ticketno → credentialNumber；org → issuingAuthority；getdate → acquiredDate；validdate → validTo；memo → note | ticketfilename 只保留摘要及待关联状态，不创建附件关联 |

证照类型为空时沿用原已执行转换的 `legacy` 值。日期复用原日期前缀语义，拒绝非法日历日期、0000 年和早于获得日期的有效期；异常日期省略并注明 pending，不以 null 清空现代日期。来源号码为掩码时同样省略并注明 pending。真实的 null 仍是显式空事实，后续必须通过可信基线比较才允许清空目标。

行校验复用 `readT5RetainedSource`，验证原行摘要、稳定来源身份和一次明确的旧传输解码，不重算摘要使篡改内容通过。员工关系使用已验证 `dbo.person` 来源索引，不能按姓名猜测。新增非空未映射列要求对新增部分核对，不能静默忽略。

2026-10-04 保留原文件离线核对：技能 6 行形成 6 条候选；证照 237 行形成 234 条候选、3 行未通过字段校验；员工依赖索引验证了 2949 条来源身份。候选数量吻合此前正式记录数量，但数量相等不证明原异常决定或目标对应关系。原隔离回执尚须服务端认证，不能自动补入这 3 行。此核对没有写生产，也没有接收七月份以后的新批次。

接入顺序：认证原 T5 来源/回执/目标初始基线 → 建立来源增量账本与逐字段三方比较 → 接入事务执行器和同一构包入口 → 验证重放、并发、现代编辑及归档保护 → 发布及真实批次验收。每个已完成领域可以独立启用，不必等待考勤、社保、工资等全部模块完成。

内部基线恢复原语 `hr-record-original-set.ts` 已以真实 PostgreSQL 验证：正常修改、清空证照编号及归档后，恢复首次加密 before 并核验完整原集合 SQL 摘要；当前业务行不变。`hr-yuzhou-record-baseline.ts` 已连接原操作、来源/目标回执、原T0员工归属及原映射认证，并完成两域实际PG链路验证。下一步是接入增量账本、逐字段比较、事务执行器与固定构包入口；尚未开放公共增量API。

2026-10-04 11:02 UTC 的已保存生产只读取证显示，证照原隔离回执为 `SOURCE_MATERIALIZATION_QUARANTINED` 共3条，其中历史候选1条、当前影响2条、旧未结账期潜在依赖1条（重叠计数）。此为已保存时点证据，不是持续实时状态；仍需逐来源摘要证明候选失败的3行与原回执精确对应。不能以此宣布历史隔离最终归档或补入完成。

验证：`node --test scripts/e2e/yuzhou-record-incremental-projection.contract.mjs`，覆盖固定映射、非法/逆序日期、掩码、文件引用、摘要/传输篡改、结构漂移、错误关联和稳定身份。离线转换测试不替代公共 API、真实 PostgreSQL 或生产业务验收。
