# 玉舟可复用增量导入包（首批合同适配器）

`scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs` 是 SQL Server 抽取之后、`POST /hr/imports/yuzhou/incremental/preview` 之前的离线转换入口。它不访问数据库或网络，也不提交业务数据；API 的预览与提交事务负责写入、权限、幂等账本和冲突处理。

抽取器应从该模块导出的 `YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256` 读取 `recipeSha256`，不得在外部复制或手填映射规则。

首批只接受已经由 `production-t2-field-projection.mjs` 覆盖的 `dbo.compact` 原始合同阶段行。该投影器会验证原始字段白名单、`sourceIdentitySha256`、`sourceRowSha256`、日历日期、金额精度和已确认的合同语义。本入口只把 API 当前可以承接的字段转换为 `contract` item，并把员工关系固定为 `dbo.person` 的稳定来源身份；不会按姓名、月份或当前目标记录猜测关系。

输入是 mode `0600` 的 JSON，顶层包含：

```json
{
  "recipeVersion": "yuzhou-reusable-incremental-contract-v1",
  "recipeSha256": "<recipe receipt>",
  "sourceSystem": "yuzhou-v10",
  "extractedAt": "2026-10-03T08:00:00Z",
  "employeeIndex": [{ "employeeCode": "E-001", "sourceTable": "dbo.person", "sourceKey": "E-001" }],
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

输出目录为 `0700`，其中 `package.json`、`manifest.json`、`coverage.json` 均为 `0600`。`package.json` 可直接作为 API preview DTO；API 接受审核状态映射中的 `draft|active|expired|terminated|cancelled`，并将原来源状态写入其导入事实/动作链。`manifest.json` 绑定配方、投影器文件 SHA-256、抽取时间、合同类型 receipt、来源身份、每行摘要、标准化状态声明与原始投影字段。相同来源行与不变配方会产生相同 item 及 row digest；新的抽取时间不会要求重跑历史 A/B。未知字段、篡改的行摘要、未决合同状态、缺失或重复的员工来源关系都会失败，不会静默遗漏。

已映射为 `active`、`expired`、`terminated` 或 `cancelled` 的合同绝不会被改写成 draft；它们以同一审核状态进入 API 新增来源事实路径。对已存在的现代合同，状态变化仍须走 API 的冲突/正常变更流程。`coverage.json` 按来源行列出每个已投影字段是 carried 还是 `pending_api_adapter`，因此工资、年限、签署日期、协议标记、历史快照和证据等当前 API 未承接事实不会被当作已导入。

当前支持范围仅为具备员工来源关系、不可变合同类型 receipt、且来源状态已通过固定规则明确为 draft、active、expired、terminated 或 cancelled 的合同主记录。员工、敏感档案、合同类型、合同变更、合同历史证据以及考勤、社保、工资、培训、奖惩、绩效仍由 `coverage.json` 明确列为待适配，且不因月份或回填日期被过滤。首批 package 不证明上述领域已经完成，也不替代其正常附件或业务更正路径。

## 复用与上线顺序

不必等待全部现代化功能完成。只要一个数据领域已有目标表、权限和正常业务操作，就可以上线该领域的固定适配器。后续员工档案、合同历史、考勤、社保、工资等按领域接入同一导入协议，不另建一套每批人工分析流程。

此前分析和 A/B 已确认的字段语义、来源稳定身份、关联关系、类型/状态映射及转换程序应固定为带版本和摘要的规则资产。每批运行仍须自动核对来源结构、规则摘要、行摘要、关联、权限及目标变更；来源结构或规则发生改变时，仅对受影响部分补充验证。规则冻结不能把尚未完成的 A/B 或未覆盖领域记为已验证。

导入流程为抽取文件 → 固定适配器生成 package → API preview → API commit → 批次结果核对。同一来源的相同事实不重复新增；增量变化与字段基线比较；新系统人工维护过的字段产生冲突，不能静默覆盖。已有首次导入映射但没有可靠字段基线的记录，当前返回 INITIAL_FIELD_BASELINE_UNKNOWN；需从首次导入保留证据补齐基线后，才能自动更新，不能拿现代当前值冒充原始基线。

目标记录是正式业务数据，按正常权限、校验和业务状态继续维护。来源标识用于追溯和去重，不决定旧/新只读分区。历史状态可以按已确认规则保留；现代办理仍使用正常变更流程。
