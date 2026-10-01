# 玉舟演练备份恢复结构对账

`rehearsal-backup-restore.mjs` 比较数据库迁移历史、平台结构、历史数据账本、逐域业务哈希、副作用快照和文件哈希。平台结构按完整结构条目计算哈希，保留条目数量和重复条目。

PostgreSQL 导出恢复会把常量 `varchar[] -> text[]` 的数组转换改写为数组内每个 `varchar` 常量转成 `text`。两个表达式具有相同的字符串值、顺序和转换结果，但 `pg_get_constraintdef` / `pg_get_indexdef` 返回的 SQL 文本不同。2026-10-01 的隔离实际导出恢复诊断中，恢复前后均有 12,818 个结构条目，379 个差异全部是这一改写。

`rehearsal-platform-catalog.mjs` 仅在 CHECK / EXCLUDE 约束、索引和触发器定义内规范化这一常量转换，使用带类型的分段表示，保留 SQL 字符串常量原文和其余 SQL。引用的标识符、常量变化、谓词操作符、其他类型转换、非恒定表达式、列默认值和条目增减仍参与严格对账。SQL 字符串及引用标识符内看起来相似的文字不被改写。

本修正只影响隔离演练结构比较，不修改数据库结构、应用业务或导入记录，也不把失败演练判为通过。正式导入仍要求实际完整演练和清理结果。

验证：`node scripts/e2e/yuzhou-rehearsal-platform-catalog.mjs`、`node scripts/e2e/yuzhou-full-domain-backup-restore.mjs`、`node scripts/e2e/yuzhou-final-rehearsal-pair-contract.mjs`。真实导出恢复差异保存在受限私有诊断目录，公共报告只记录数量与哈希。
