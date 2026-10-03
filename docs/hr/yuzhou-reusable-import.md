# 玉舟可复用增量导入包（员工与合同适配器）

`scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs` 是 SQL Server 抽取之后、`POST /hr/imports/yuzhou/incremental/preview` 之前的离线转换入口。它不访问数据库或网络，也不提交业务数据；API 的预览与提交事务负责写入、权限、幂等账本和冲突处理。

抽取器应从该模块导出的 `YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256` 读取 `recipeSha256`，不得在外部复制或手填映射规则。

首批接受经验证的 `dbo.person` 原始员工行，以及已经由 `production-t2-field-projection.mjs` 覆盖的 `dbo.compact` 原始合同阶段行。员工行必须绑定通过既有 verifier 的 v2 `MACHINE_CANDIDATE` 任职状态决策工件（v1 审计工件不可物化），稳定身份仍为 `sha256(dbo.person NUL sourceKey)`，并且只投影 API 已支持的员工编码、姓名、任职状态/类型和入职日期。`formalDate` 不会映射到 `probationEndDate`；它在私有 `coverage.json` 中标记为 `pending_semantic_binding`。员工类型复用 T0 `projectLegacyEmployeeState` 的固定规则，保留 `a → temporary`，但不复用旧日期投影。合同关系直接使用同批员工或 `employeeIndex` 的稳定来源身份，不会按姓名、月份或当前目标记录猜测关系。

输入是 mode `0600` 的 JSON，顶层包含：

```json
{
  "recipeVersion": "yuzhou-reusable-incremental-v2",
  "recipeSha256": "<recipe receipt>",
  "sourceSystem": "yuzhou-v10",
  "extractedAt": "2026-10-03T08:00:00Z",
  "employeeIndex": [],
  "employeeRecords": ["verified dbo.person raw rows"],
  "jobStateDecisionArtifact": "verified immutable employee job-state decision artifact",
  "contractTypeMappingArtifact": "<immutable dbo.compacttypecode to enabled current-scope hr_contract_type receipt>",
  "contractStateResolutions": { "草稿": { "normalizedStatus": "draft", "mappingEvidence": "<reviewed state receipt>" } },
  "records": ["verified dbo.compact stage rows"]
}
```

运行方式：

```sh
node scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs \
  --input /private/yuzhou/extract.json --output /private/yuzhou/incremental-package
```

`contractTypeMappingArtifact` 是可复用的、不可变的来源类型映射 receipt。每条 binding 必须带 `dbo.compacttypecode` 的来源 key/identity、`sourcePkCanonical`、来源 code/name、同一 tenant/park 中已启用的 `hr_contract_type` UUID、`loaded|verified` 映射状态和原始映射 receipt 的 `mappingEvidenceSha256`。脚本验证整个 artifact 的 SHA-256；合同仅按唯一的已验证 `typeName` binding 取 `contractTypeId`，不能每批人工选择或按目标名称猜测。

输出目录为 `0700`，其中所有文件均为 `0600`。单批生成 `package.json`；超过 2000 个 item 时自动按员工先于合同、稳定来源身份的顺序生成 `package-0001.json` 等，每批最多 2000 条。CLI 返回有序 `packagePaths`，调用方必须按顺序逐包 preview/commit 并核对全部结果；只有单批时 `packagePath` 才非 null，不能拿多批中的第一包当完整抽取。不同批次是独立事务，失败后按原 package 重试并核对后续依赖，不能宣称整个抽取跨批原子提交。空抽取只生成零计数 manifest/coverage，不生成 API package 或 API 导入 receipt。

`manifest.json` format v2 绑定配方、适配器、T0 员工类型规则、job-state verifier、共享 API 字段/枚举契约及原投影/合同语义/目标字段模型文件摘要，另包含工件摘要、来源身份、每行摘要、原始员工事实、字段覆盖和每批 package 摘要。来源顺序不影响分批。来源未变、配方未变时 item/row digest 相同；新抽取日期无需重跑历史 A/B，且不按七月截止、同月或回填日期过滤。

员工编码和姓名遵守 API 的 64/100 字符串长度限制；任职状态必须有 map 决策；hireDate/formalDate 必须是有效日历日期或空值。显式空 hireDate 保留为 null，参与来源字段基线比较。未承接的员工字段保留在私有 manifest 原始事实中，并逐字段标为 pending；部门/岗位关系未被猜测或写入。合同继续使用原投影白名单验证。篡改摘要、重复来源、未决状态和缺失/重复的员工关系均失败。摘要验证和既有工件校验不替代来源抽取的独立保管与真实性证据。

已映射为 `active`、`expired`、`terminated` 或 `cancelled` 的合同绝不会被改写成 draft；它们以同一审核状态进入 API 新增来源事实路径。对已存在的现代合同，状态变化仍须走 API 的冲突/正常变更流程。`coverage.json` 按来源行列出每个已投影字段是 carried 还是 `pending_api_adapter`，因此工资、年限、签署日期、协议标记、历史快照和证据等当前 API 未承接事实不会被当作已导入。

当前 raw adapter 支持员工编码、姓名、任职状态/类型、入职日期，以及已确认状态和员工/类型关系的合同主记录。`formalDate` 为 `pending_semantic_binding`，离职日期为 `pending_lifecycle_adapter`，部门/岗位及其他未承接字段为 `pending_api_adapter`。敏感档案、合同类型、合同变更、合同历史证据以及考勤、社保、工资、培训、奖惩、绩效仍待独立适配。首批 package 不证明这些领域或全部字段已经完成。

## 复用与上线顺序

不必等待全部现代化功能完成。只要一个数据领域已有目标表、权限和正常业务操作，就可以上线该领域的固定适配器。后续员工档案、合同历史、考勤、社保、工资等按领域接入同一导入协议，不另建一套每批人工分析流程。

此前分析和 A/B 已确认的字段语义、来源稳定身份、关联关系、类型/状态映射及转换程序应固定为带版本和摘要的规则资产。每批运行仍须自动核对来源结构、规则摘要、行摘要、关联、权限及目标变更；来源结构或规则发生改变时，仅对受影响部分补充验证。规则冻结不能把尚未完成的 A/B 或未覆盖领域记为已验证。

导入流程为抽取文件 → 固定适配器生成 package → API preview → API commit → 批次结果核对。同一来源的相同事实不重复新增；增量变化与字段基线比较；只有来源实际改变的字段参与现代目标基线冲突比较，不能静默覆盖同字段现代编辑。来源状态未变、仅现代正常生命周期已改状态时，保留现代状态并允许其他无冲突字段更新；来源状态真正改变时，preview/commit 均返回 `NORMAL_EMPLOYMENT_WORKFLOW_REQUIRED`，即使当前状态已与新来源一致，也必须由正常生命周期办理承接。每次写入使用本次比较所读取的当前 target version 做 CAS，读取之后发生的现代并发编辑返回 409 并回滚目标与账本。已有首次导入映射但没有可靠字段基线的记录，当前返回 INITIAL_FIELD_BASELINE_UNKNOWN；需从首次导入保留证据补齐基线后，才能自动更新，不能拿现代当前值冒充原始基线。

目标记录是正式业务数据，按正常权限、校验和业务状态继续维护。来源标识用于追溯和去重，不决定旧/新只读分区。历史状态可以按已确认规则保留；现代办理仍使用正常变更流程。


## 本地验证边界

`yuzhou-reusable-incremental-package-contract.mjs` 验证 employee/contract raw adapter、v2 工件 eligibility、身份/摘要、字段覆盖、2001/2000/0 分批及私有输出。`hr-yuzhou-incremental-import.pg.spec.ts` 使用实际 CLI 生成的包，通过真实 PostgreSQL preview/commit 验证现代状态连续性、同字段冲突、未知首次基线、CAS 与独立连接并发。

PG 测试仅接受 `POSTGRES_HOST=127.0.0.1`、`POSTGRES_PORT=55491` 与独立启用的 `HR_YUZHOU_INCREMENTAL_PG_REQUIRED=1`。测试用管理员连接 postgres 只负责创建/清理临时数据库；业务查询都在新建的 `jinhu_hr_incremental_lab_<24hex>` 专用库，显式断言 `current_database()` 与配置一致。未指定 `POSTGRES_DB` 时随机生成；指定时也必须符合严格名称并成功创建新库，绝不复用现有库。清理断言该库残留为零。凭据仅通过私有进程环境传递，不输出到报告。

该 synthetic fixture 覆盖本次内核与适配器，不代表完整迁移链、历史数据字段基线 bootstrap、真实抽取 A/B 或生产写入已经完成。正常任职状态变更仍待生命周期适配器承接。
