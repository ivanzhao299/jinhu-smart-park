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

输出目录为 `0700`，其中所有文件均为 `0600`。单批生成 `package.json`；超过 2000 个 item 或 8 MiB 精确 JSON 字节时自动按员工先于合同、稳定来源身份的顺序生成 `package-0001.json` 等，每批最多 2000 条且不超过 8 MiB。CLI 返回有序 `packagePaths`，调用方必须按顺序逐包 preview/commit 并核对全部结果；只有单批时 `packagePath` 才非 null，不能拿多批中的第一包当完整抽取。不同批次是独立事务，失败后按原 package 重试并核对后续依赖，不能宣称整个抽取跨批原子提交。空抽取只生成零计数 manifest/coverage，不生成 API package 或 API 导入 receipt。

`manifest.json` format v2 绑定配方、适配器、T0 员工类型规则、job-state verifier、共享 API 字段/枚举契约及原投影/合同语义/目标字段模型文件摘要，另包含工件摘要、来源身份、每行摘要、原始员工事实、字段覆盖和每批 package 摘要。来源顺序不影响分批。来源未变、配方未变时 item/row digest 相同；新抽取日期无需重跑历史 A/B，且不按七月截止、同月或回填日期过滤。

员工编码和姓名遵守 API 的 64/100 字符串长度限制；任职状态必须有 map 决策；hireDate/formalDate 必须是有效日历日期或空值。显式空 hireDate 保留为 null，参与来源字段基线比较。未承接的员工字段保留在私有 manifest 原始事实中，并逐字段标为 pending；部门/岗位关系未被猜测或写入。合同继续使用原投影白名单验证。篡改摘要、重复来源、未决状态和缺失/重复的员工关系均失败。摘要验证和既有工件校验不替代来源抽取的独立保管与真实性证据。

已映射为 `active`、`expired`、`terminated` 或 `cancelled` 的合同绝不会被改写成 draft；它们以同一审核状态进入 API 新增来源事实路径。对已存在的现代合同，状态变化仍须走 API 的冲突/正常变更流程。`coverage.json` 按来源行列出每个已投影字段是 carried 还是 `pending_api_adapter`，因此工资、年限、签署日期、协议标记、历史快照和证据等当前 API 未承接事实不会被当作已导入。

当前 raw adapter 支持员工编码、姓名、任职状态/类型、入职日期，以及已确认状态和员工/类型关系的合同主记录。`formalDate` 为 `pending_semantic_binding`，离职日期为 `pending_lifecycle_adapter`，部门/岗位及其他未承接字段为 `pending_api_adapter`。敏感档案、合同类型、合同变更、合同历史证据以及考勤、社保、工资、培训、奖惩、绩效仍待独立适配。首批 package 不证明这些领域或全部字段已经完成。

## 复用与上线顺序

不必等待全部现代化功能完成。只要一个数据领域已有目标表、权限和正常业务操作，就可以上线该领域的固定适配器。后续员工档案、合同历史、考勤、社保、工资等按领域接入同一导入协议，不另建一套每批人工分析流程。

### 固定入口与每批操作约定

对已覆盖的员工和合同，统一操作链为：新来源抽取文件 → 本文固定 CLI → 有序 JSON 数据包 → 生产 `/hr/imports` 预览、确认提交、查询结果。CLI 是可复用程序，JSON 是本次数据；不能用每次人工重新分析替代固定程序，也不能把任意 SQL Server `.bak` 直接交给当前 JSON 工作台。当前 CLI 的输入是经过抽取的受限 JSON，备份恢复和来源抽取仍属于前置步骤；尚未实现任意备份上传后一键导入。

| 环节 | 固化后如何执行 |
| --- | --- |
| 字段语义、类型/状态映射、身份规则、转换和分批 | 复用已验证的版本化程序和映射工件；同结构批次不重复历史分析、切片及完整 A/B |
| 原始员工/合同字段基线 | 一次性建立；已接受记录后续不用重复恢复或附带原始见证 |
| 每批来源与包校验 | 自动检查格式、规则摘要、稳定身份、关系、大小及重复记录；不能省略 |
| 新系统正在维护的数据 | 按来源基线比较，只更新允许且无冲突的字段；相同事实记为 unchanged |
| 未知状态、新类型、未支持字段、现代同字段修改 | 输出待处理结果，仅核对受影响记录或规则；不回到全量旧数据分析 |
| 新领域或结构/规则变更 | 对新增适配部分补充验证后接入同一入口，不等待整个 HR 系统全部完成 |

2026-10-04 员工 2938 / 合同 798 的原始字段基线已在生产接受；独立只读核对证明完整业务行摘要在此次恢复前后相同。详见 [增量接口验收记录](./yuzhou-incremental-import.md)。下一批真实来源仍需实际提供和抽取，不能以这次一次性恢复替代七月份以后新增数据的验收。

此前分析和 A/B 已确认的字段语义、来源稳定身份、关联关系、类型/状态映射及转换程序应固定为带版本和摘要的规则资产。每批运行仍须自动核对来源结构、规则摘要、行摘要、关联、权限及目标变更；来源结构或规则发生改变时，仅对受影响部分补充验证。规则冻结不能把尚未完成的 A/B 或未覆盖领域记为已验证。

导入流程为抽取文件 → 固定适配器生成 package → API preview → API commit → 批次结果核对。同一来源的相同事实不重复新增；增量变化与字段基线比较；只有来源实际改变的字段参与现代目标基线冲突比较，不能静默覆盖同字段现代编辑。来源状态未变、仅现代正常生命周期已改状态时，保留现代状态并允许其他无冲突字段更新；来源状态真正改变时，preview/commit 均返回 `NORMAL_EMPLOYMENT_WORKFLOW_REQUIRED`，即使当前状态已与新来源一致，也必须由正常生命周期办理承接。每次写入使用本次比较所读取的当前 target version 做 CAS，读取之后发生的现代并发编辑返回 409 并回滚目标与账本。已有首次导入映射但没有可靠字段基线的记录，当前返回 INITIAL_FIELD_BASELINE_UNKNOWN；需从首次导入保留证据补齐基线后，才能自动更新，不能拿现代当前值冒充原始基线。

目标记录是正式业务数据，按正常权限、校验和业务状态继续维护。来源标识用于追溯和去重，不决定旧/新只读分区。历史状态可以按已确认规则保留；现代办理仍使用正常变更流程。


## 本地验证边界

`yuzhou-reusable-incremental-package-contract.mjs` 验证 employee/contract raw adapter、v2 工件 eligibility、身份/摘要、字段覆盖、2001/2000/0 分批及私有输出。`hr-yuzhou-incremental-import.pg.spec.ts` 使用实际 CLI 生成的包，通过真实 PostgreSQL preview/commit 验证现代状态连续性、同字段冲突、未知首次基线、CAS 与独立连接并发。

PG 测试仅接受 `POSTGRES_HOST=127.0.0.1`、`POSTGRES_PORT=55491` 与独立启用的 `HR_YUZHOU_INCREMENTAL_PG_REQUIRED=1`。测试用管理员连接 postgres 只负责创建/清理临时数据库；业务查询都在新建的 `jinhu_hr_incremental_lab_<24hex>` 专用库，显式断言 `current_database()` 与配置一致。未指定 `POSTGRES_DB` 时随机生成；指定时也必须符合严格名称并成功创建新库，绝不复用现有库。清理断言该库残留为零。凭据仅通过私有进程环境传递，不输出到报告。

该 synthetic fixture 覆盖本次内核与适配器，不代表完整迁移链、真实原始证据的生产基线接受、真实抽取 A/B 或生产写入已经完成。正常任职状态变更仍待生命周期适配器承接。

## 已有正式数据的一次性原始基线

复用原成功导入留存的 sealed plan 与 T0/T2 payload bundle，离线生成每项 witness：

```sh
node scripts/hr-cutover/prepare-yuzhou-initial-baseline-witness.mjs \
  --plan /private/yuzhou/sealed-plan.json \
  --payload /private/yuzhou/t0-payload.json \
  --package /private/yuzhou/incremental-package/package.json \
  --out /private/yuzhou/anchored-package.json
```

输入文件为无符号链接、单硬链接的 `0600` 文件，输出父目录为实际路径的 `0700` 目录。
脚本验证 bundle 字节摘要/规范摘要、逐行 payload 摘要、来源身份、scope，以及 sealed plan
`dependencyRefs` 中 role/phase/source identity 对应的原目标 UUID；原逐行 target hash 必须匹配。
它只处理原 insert 的 employee/contract；新来源无原行可保留为新增。profile/T5 不附加 witness。
T0 和 T2 分别对所属包执行；如果同包同时包含两类记录，可将第一步输出作为第二步输入。
输出已包含首批上传所需的完整逐项证明，不要求向 API 上传整个历史 sealed plan 或 payload bundle。
`PREPARED_NOT_ACCEPTED` 仅表示离线准备，API 在 preview/commit 仍独立核对当前原始数据库 receipts。

builder 和 witness helper 均按最多 2000 条与 8 MiB 双上限拆包，包含完整 witness、UTF-8 多字节字符、
包 envelope、分批 manifest ID 和最终换行。builder 输出 `package-0001.json` 等；witness helper
仅一包时写入 `--out`，多包时写入 `<out>.part-0001.json` 等，按编号依次处理；不会将第一分包
伪装为完整输出。单条超限返回 `YUZHOU_INCREMENTAL_SINGLE_ITEM_EXCEEDS_BYTE_LIMIT`
，不截断私有事实。
后续正常批次只需原稳定 source key 和规范化字段，不再重复附带 witness。

新增 `yuzhou-initial-baseline-witness.contract.mjs` 对比原 writer 与共享 canonical 模型、真实保留格式、
私有 CLI、精确 UTF-8 大小边界及 2000/2001 分批。
`HR_YUZHOU_INITIAL_BASELINE_PG_REQUIRED=1` 启用专用 `jinhu_hr_baseline_lab_<24hex>` PostgreSQL 测试，
实际执行原 235/278/281/282 与新增 329 等迁移；使用合成完整投影与原 writer 哈希，覆盖预览零基线/业务写入、
未知恢复、modern 冲突/状态保护、篡改/歧义/回滚拒绝、不可重设基线、独立连接并发及失败事务零残留。
专用库必须新建、断言 current_database，最终仅清理该库并证明残留为零。
这项验证解决 employee/contract 原始基线恢复代码边界，不宣称 profile、全部 HR 领域或生产接受已完成。

## 从受控 staging 一次构包

已有 T0/T2 提取和转换结果时，可直接运行离线入口；无需人工拼装 `employeeRecords` 或 `records`：

```sh
node scripts/hr-cutover/build-yuzhou-import-from-staging.mjs \
  --config /private/yuzhou-next/import-config.json
```

配置文件和每个引用文件须为独占的普通文件（0600、无符号链接），直属目录为 0700。路径必须绝对且无符号链接祖先；macOS 临时目录应使用解析后的 `/private/var/...` 路径。输出目录必须尚不存在，其直属父目录为 0700。配置格式如下，哈希填写各文件**实际字节**的 SHA-256；示例占位符不是可运行的凭证或映射：

```json
{
  "formatVersion": 1,
  "t0Manifest": {
    "path": "/private/yuzhou-next/staging-t0/manifest.json",
    "sha256": "<64 hex SHA-256>"
  },
  "t2Manifest": {
    "path": "/private/yuzhou-next/staging-t2/manifest.json",
    "sha256": "<64 hex SHA-256>"
  },
  "includeEmployees": true,
  "extractedAt": "2026-10-04T08:00:00Z",
  "sourceCustody": {
    "sourceSnapshotSha256": "<64 hex controlled snapshot digest>",
    "evidenceSha256": "<64 hex custody evidence digest>",
    "declaration": "caller_attests_same_controlled_snapshot"
  },
  "jobStateDecisionArtifact": {
    "path": "/private/yuzhou-next/reviewed-job-state.json",
    "sha256": "<64 hex SHA-256>"
  },
  "contractTypeMappingArtifact": {
    "path": "/private/yuzhou-next/reviewed-contract-types.json",
    "sha256": "<64 hex SHA-256>"
  },
  "contractStateResolutions": {
    "path": "/private/yuzhou-next/reviewed-contract-states.json",
    "sha256": "<64 hex SHA-256>"
  },
  "outputDir": "/private/yuzhou-next/package-output"
}
```

`contractStateResolutions` 引用文件内容即前述 `草稿` 等状态到规范状态及审核依据的对象。员工输出依赖有效 job-state 决策；合同输出依赖有效类型绑定和显式状态决策。员工-only 可省略 T2 和两个合同映射引用。合同-only 设 `includeEmployees:false`，仍须提供完整、校验通过的 T0 manifest/员工源行以生成身份依赖索引；不会按姓名猜测员工。空源记录会得到 manifest/coverage/assembly receipt，但没有 API 包。

入口验证实际 T0/T2 转换器的完整 manifest 域、文件名、文件哈希、记录数、行身份和原始行哈希；T2 固定解开转换器加倍的 JSON 传输反斜线，随后验证原哈希，不改写源事实、不修补哈希。单文件上限 64 MiB，整个读取预算 256 MiB（包括配置、manifest 和映射）。同一源身份重复、漏行、未知状态、缺少依赖、兼容漂移或不安全路径都会失败；失败不会发布半批包，临时输入会删除。

输出沿用原 builder 的有序 2000 条/8 MiB 分包和 0600/0700 权限，额外生成私有 `assembly-receipt.json`，记录配置/manifest/映射哈希、源域完整计数和去向。组织、岗位、合同类型/变更、字典等源域仍保留在原 staging，收据声明待处理或映射证据；这些域没有因本入口而得到 API 适配。正式日期、离职日期、组织和 profile 的既有未支持字段继续由 builder 的私有 coverage 说明。

收据的 `requested/excluded/eligible` 统计源主记录是否命中精确历史排除；`apiInput` 单列本次实际员工/合同 API 输入数，`dependencyIndex.employee` 单列合同-only 模式的员工索引数。合同-only 模式的 eligible 员工用作关系索引，不应加到 API 输出条数。成功输出的 `itemCount` 必须等于 `apiInput.employee + apiInput.contract`。若新合同依赖被精确排除的员工，构包报缺失依赖并整批失败，不会顺带静默排除该合同；必须先取得受控的可用依赖或处理来源事实。

CLI 错误只输出预先列举的固定安全代码；解析器、文件系统和未知错误仍统一为 `YUZHOU_STAGING_ENTRY_FAILED`，不会输出来源值、路径或凭据。常见需要处理的错误如下：

| 错误代码 | 后续处理 |
| --- | --- |
| `YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_STATE_UNRESOLVED` | 对未决员工来源状态补充审核决策后重新构包 |
| `YUZHOU_REUSABLE_INCREMENTAL_STATE_UNRESOLVED` | 补充合同状态映射文件中的审核决策 |
| `YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_MISSING` | 核对合同所引用的员工是否存在于本次有效源行或依赖索引；不得按姓名猜测 |
| `YUZHOU_REUSABLE_INCREMENTAL_TYPE_MISSING` 或 `YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_REQUIRED` | 核对或补充经审核的合同类型绑定材料 |
| `YUZHOU_STAGING_ENTRY_SCOPE_MISMATCH` | 对齐明确声明的目标范围与合同类型映射材料 |
| `YUZHOU_INCREMENTAL_SINGLE_ITEM_EXCEEDS_BYTE_LIMIT` | 处理超限的完整记录，不能删除证明字段或截断源事实 |

未知代码不会直接透传。任何构包错误都不发布半批输出；固定代码只帮助定位需处理的规则或依赖，不代表来源真实性或生产接受。

调用方声明的 snapshot/evidence 哈希只绑定本次准备材料，脚本不独立认证来源真实性，也不因为两个目录时间接近而确认同一来源。输出保持 `productionImport:HOLD`；经过普通工作台预览、显式提交和业务验收才形成生产结果。本入口面向**已受控提取的 JSON staging**，没有 `.bak` 任意文件一键恢复、SQL 连接或生产写入功能。

可选 `historicalExclusions:{"path":"/private/yuzhou-next/original-exclusions.json","sha256":"<64 hex>"}` 引用一次从真实原始 sealed plan 和成功执行证据整理的不可变归档例外材料。使用此选项时，`sourceCustody.targetScope:{"tenantId":"...","parkId":"..."}` 必填，与例外材料和合同类型映射（若提供）的 scope 一致。即使省略历史排除材料，只要配置声明 targetScope，合同类型映射也必须与该 scope 一致。例外文件格式为：

```json
{
  "formatVersion": 1,
  "artifactKind": "yuzhou_original_historical_exclusions",
  "sourceSystem": "yuzhou-v10",
  "originalSourceSnapshotSha256": "<64 hex>",
  "originalOperationId": "yzprod-import-<YYYYMMDDTHHMMSSZ>-<12 hex>",
  "originalSealedPlanSha256": "<64 hex>",
  "originalPlanFileSha256": "<64 hex>",
  "originalExecutionProofFileSha256": "<64 hex>",
  "targetScope": {"tenantId":"...","parkId":"..."},
  "policy": "ARCHIVE_UNCHANGED_ORIGINAL_QUARANTINE",
  "entries": [{
    "domain": "employee",
    "sourceTable": "dbo.person",
    "sourceKey": "sha256:<64 hex stable source identity>",
    "sourceRowSha256": "<64 hex original source row>",
    "decisionReceiptSha256": "<64 hex original decision receipt>",
    "reasonCode": "ORIGINAL_QUARANTINE"
  }]
}
```

条目只支持 employee/dbo.person 和 contract/dbo.compact 的正确配对，身份不能重复，reasonCode 必须为非空大写安全代码。只有**稳定身份与原行哈希都相同**的历史条目会排除；来源内容已变化时记为 `nonApplicableChanged` 并交给普通 builder 校验构包，不能让旧例外永久屏蔽修复后的记录。未出现在本次提取中的旧条目记为 `notPresent`，不代表删除。assembly receipt 保留材料哈希、原 operation/plan/proof 引用、应用条目和 requested/excluded/eligible 计数；未被 API 支持的源域继续留在 staging，不作为排除项。

此材料在离线入口的信任边界内是由调用方提供、通过配置 SHA 固定的历史证据声明。入口不重新加载大体积原 plan、不独立认证生产 operation/decision receipt，也不授予跳过任意新行或生产写入的权限。没有真实原始归档证据时应省略该选项；普通行失败仍使整批失败，不能伪造例外来宣称完整验收。

## 原 T5 档案连续增量

固定入口可同时接受 `profileManifest: {path, sha256}`。它引用私有 T5 staging manifest 的 `domains.person_core`：`sourceObject=dbo.person.core_residue`、`file=person_core.jsonl`、`rows` 和实际 `fileSha256`。版本为 1、`productionImport=HOLD`；`yuzhou_t5_nonfile_materialization_stage` 格式另核其 `nonfileBusinessSha256`，manifest 若声明 source snapshot 则须与 caller custody 一致。配置固定所用 manifest 实际字节摘要，不能把不同留存 manifest 冒称原 manifest 等值；原 person_core 文件是否属于原 binding，另按其确切文件摘要证明。现有双反斜杠传输只逆转一次，并用原 row hash 验证。档案 identity 来自原 `id`，员工 dependency 来自 `person`，两者不能混用。只投射 sex/birthday/handtel/email/addr/idcard 六列；生日接受经过日历校验的原本地 ISO datetime，取日期部分。其他列逐字段保留 pending coverage，不使用旧 materialized 密文。

已有原 T5 档案先单独构建 baseline-only 包：配置 `profileBaselineWitness: {path, sha256}`，文件内容为 `{version:1, proof:"original_t5_whole_set_v1", operationId, bindingSha256}`，原操作 ID 使用 `yzprod-import-YYYYMMDDTHHMMSSZ-12hex`。该模式档案 DTO 的 `fields` 为 `{}`。认证在 API 的事务中锁原成功操作防回滚、锁原 profile/source/receipt 集合，以固定 Asia/Shanghai 复算原 PostgreSQL whole-row count/hash 和全 receipt count/hash，与原 immutable owned_state 完全相等后才接受。逐行内部解密原来源、验证 identity/row hash、T0 owner 成功链，并核对原身份证明文 trim 与 certified target fingerprint/hash-key 相容。证明失败明确拒绝，不把当前编辑后的行冒充原基线。首次接收仅写加密账本和不可变 provenance，不改变业务列、版本或时间。

接收后移除 witness，按普通来源变化构包。API 复用已接受的原 source/target 分离基线、三方冲突、权限和版本 CAS；后续合法现代编辑不会再触发全集原摘要门槛。身份证比较用稳定 fingerprint，避免随机密文或旧 trim 与当前去空白/大写规则导致伪变化。新员工先于其新档案排序，仍使用同一 2000 条/8 MiB 分包。

历史档案异常可单独配置 `profileExclusions` 或 `profileFieldAdmissions` pinned 私有文件，格式为 `{formatVersion:1, artifactKind, originalOperationId, originalBindingSha256, targetScope, entries}`。kind 分别为 `yuzhou_original_profile_exclusions`、`yuzhou_original_profile_field_admissions`。每项为 `{sourceIdentitySha256, sourceRowSha256, decisionReceiptSha256, reasonCode}`；field admission 额外要求 `fields`，只能为 gender/dateOfBirth/personalMobile/personalEmail/address/idNumber。scope 必须等于 `sourceCustody.targetScope`；同时提供 witness 时原操作和 binding 也必须相等。

只有原 identity 和完整 row hash 完全相同的异常事实适用：exclusion 排除整行；field admission 仅省略声明的无效字段并保留 pending。行变化进入普通校验；不在新快照的原行计为 notPresent，不解释成删除。receipt 分别记录 requested/excluded/eligible/nonApplicableChanged/notPresent/pendingFields、artifact SHA 和来源声明。私有工件的真实性仍为 caller custody，配置 digest 仅证明完整性，不独立认证原 receipt 或授予生产写权限。没有真实异常证据时不可猜造工件。已有 baseline 不可重置，原 T0/T2 v1 witness 保持兼容。

本地验证使用独立随机数据库和真实迁移，验证 CLI 构包到 API、原基线业务全行不变、重放、新档案、新员工及档案、现代编辑、保护值冲突及双连接 CAS 回滚。合成验证与原集合只读观察均不表示新来源生产导入已验收。

Direct reusable builder 的 profile witness 必须是严格完整 v1；manifestId 绑定 witness 字节与 admission 声明，配方也绑定 shared profile witness contract。禁止传入任意 `profileOmittedFields`。入口向 builder 传递 `profileAdmissionEvidence`（declaration=`caller_attests_original_unchanged_invalid_fields`、targetScope、artifactCanonicalSha256、原 artifact），builder 独立验证声明/摘要/scope/原 operation，并仅对 exact identity+原完整 sourceRowSha 的匹配行推导省略字段。私有工件仍是 caller custody 声明，不因此升级成独立认证的原字段决策。

CI 的 `HR Refresh Scope PostgreSQL` 作业使用同一合成 PostgreSQL 服务的 loopback 55491 端口，明确启用并运行个人资料基线、员工/合同原始基线和增量事务套件；这些测试创建独立临时数据库并核对清理残留，不访问生产。通用的 scope 作业通过不能单独证明导入事务通过，需检查 `Verify Yuzhou incremental import continuity transactions` 步骤。
