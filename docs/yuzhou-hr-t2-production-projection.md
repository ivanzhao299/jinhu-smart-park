# T2 合同生产字段转换

`scripts/hr-cutover/production-t2-field-projection.mjs` 补齐真实 T2 staging 到目标字段之间的纯转换层。它处理合同类型、合同、合同变更和只含哈希的历史证据，不连接数据库，不重新提取旧库，不处理文件内容，不产生授权。

## 已实现

- 复核单条记录的来源身份、原始行哈希和源键；新增但未映射的源字段明确拒绝，不静默丢弃。
- 按现有目标模型输出 4 类表的完整字段集合：合同类型 5 项、合同 28 项、合同变更 12 项、历史证据 9 项。
- 金额保持固定两位小数字符串，适配 `numeric(18,2)`；只允许去掉小数点两位后的零，拒绝需要舍入或溢出的值。
- 复用现有日期推导期限、直接续签次数的语义决定；原始 `compacttime`、`totalcompacttime`、`continueyears` 保留在快照中，不误当成已经明确的月份。
- 单次 `jddate` 只进入签署日期，不同时填充首次/末次签署历史；这两项和累计期限保持待补证，不宣称功能完成。
- 合同变更保留原始日期时间，日期列只投影日期部分；本地签署时间为 `YYYY-MM-DDTHH:mm:ss.SSS`，不猜测时区。通用字段验证器仅对此历史签署列增加该格式，其他时间字段不放宽。
- 文本和附件只生成哈希索引，来源身份与现有 T2 phase artifact 的投影规则一致；不填写文件 ID，不标记二进制已经迁移。

## 尚未完成

`production-t2-decision-candidates.mjs` 已增加内存候选组装层：人员 → 合同类型 → 合同 → 合同变更/证据索引的关联，以及来源业务键碰撞和目标冲突判定。完整 T2 阶段清单（含零表）、C/S/M、T0 与 16 表目标清单的范围/身份绑定必须一致。T0 可用依赖需重新核对字段、依赖图、业务键和目标 ID；不能仅信任传入的 UUID。

类型名只有唯一精确匹配才关联，重名或缺失进入差异；合同变更必须同时对应合同号和员工来源。目标相同为 `skip_exact` 候选，不同为待审冲突，绝不自动覆盖。来源重复业务键的全部成员在下游组装前被阻断，避免第一条先入选。语义错误保留合同及派生证据的完整行数，不静默丢弃。

私有文件入口 `materialize-production-t2-decision-candidates.mjs --config <private-config>` 已实现并通过合成私有文件测试：核对当前提交、工件文件字节、来源清单、T2 staging、已有类型/状态字典后调用组装器。**真实源运行与封存/生产执行接线尚未完成。** `resolved` 不是审批证明，`READY_FOR_REVIEW` 不是可生产执行。当前没有真实数据候选包、生产写入、API/页面回读、业务签署或完整 T2 验收证据。

已有 transform 产出的日期推导期限和续签次数在本层检查类型与语义标记，但不重复实现推导算法；其正确性须由上游来源清单、已验证 transform 和阶段工件共同证明，单条自报哈希不是语义或来源真实性证明。

未知/null 协议标记保持明确错误，不能为使导入通过而自动改成 false；由后续候选生成器记入差异/待处理台账。投影函数不自行删除、忽略或批准隔离行。

## 验证入口

`pnpm test:e2e:yuzhou-production-import-t2-artifact` 同时执行原有来源工件测试与新字段转换测试，沿用当前 PR CI 入口。新测试使用合成数据；目标模型校验不是数据库、API 或前端往返证明。

本地 9 组测试通过，其中 1 组通过显式指定本地 PostgreSQL 容器，执行 `BEGIN READ ONLY` 内的固定字面量转换，证明金额和时间类型转换后的字段/哈希一致；不读取业务表，不写记录。未指定容器时该组明确跳过，不冒充 CI 数据库验证。真实 writer 装载、关联、回读与回滚尚未执行。

具体函数合同见 `.trellis/spec/api/backend/yuzhou-t2-production-projection.md`。

候选组装测试：`node --test scripts/e2e/yuzhou-production-t2-decision-candidates-contract.mjs`，同时已纳入上述 T2 测试入口。覆盖非空四表依赖、零行、输入重排、来源和清单漂移、缺失/被阻断人员、类型歧义、合同归属、来源碰撞、已有目标精确匹配/差异和 ID 碰撞。测试数据全部为合成，不代表真实记录已经通过。

## 私有文件入口合同

- 配置字段：`formatVersion=1`、`triple`、`stagingDir`、`artifacts`、`outputPath`。`artifacts` 包含 `sourceManifest`、`phaseArtifact`、`targetInventory`、`t0Candidates`、`dictionaryPackage` 和可为 null 的 `changeDecisions`；非空项均为 `{path,sha256}`，哈希针对实际文件字节。
- 配置和输入使用受控绝对路径、仅所有者可读写的 0600 单链接文件；staging 和输出目录为 0700，拒绝符号链接。每文件最多 32 MiB，合计读取最多 128 MiB；空 JSONL 仅在来源 manifest 明确为零行时接受。不会读取工资文件或文件二进制。
- 生产 inventory 的 `sourceManifestSha256` 是 `verifyProductionSourceManifest` 返回的规范化哈希，**不是**描述符里的文件字节哈希。两种身份都必须核验，不能互换。
- 已有 `yuzhou_core_non_t0_machine_dictionary_package` 的 C/S/M、T2 文件证据、类型/状态来源字段、状态使用次数及 machineAttestationSha256 都重新核对；机器哈希不等于外部/人工审批，不会因校验通过而签发授权。
- 可选变更分类候选的 kind 为 `yuzhou_hr_t2_change_classification_candidates`，绑定 triple 与 contract-changes.jsonl 的 `stageFileSha256`；每条为 `{sourceIdentitySha256,sourceRowSha256,changeType,evidenceSha256}`。缺项保持差异，不默认续签。源逻辑台账中 `RULE-F089F24164D89466` / `web_compact_c` 的查询列明确标注续订，已核对归档文件哈希 `f1cc43ab459f8808198bb11ee5834231282546e88656eb16360f4f6535cf2c12`。下述分类入口已完成本地真实源验证；该依据只支持已验证关系的历史分类，不表示所有合同业务复现。
- 仅在全部校验通过后独占创建新候选文件，并做哈希回读。失败不覆盖已有文件，不删除可能的私有部分输出；重试应使用明确的新输出名。stdout 只有数量、分类码和哈希；输出候选文件包含业务字段，必须保持私有且不提交。
- 私有文件测试：`node --test scripts/e2e/yuzhou-production-t2-materializer-contract.mjs`，已接入原 T2 CI 测试命令。

## 源过程支持的变更分类入口

`materialize-production-t2-change-classifications.mjs --config <private-config>` 生成上述 `changeDecisions` 文件。配置包含 `formatVersion`、`triple`、`stagingDir`、`sourceManifest:{path,sha256}`、`routine:{path,sha256}`、`outputPath`。CLI 必须使用当前干净代码提交，核验源清单及 T2 全部四份文件的字节/数量/状态使用，独立核验固定旧过程实际字节，再调用纯分类器。

只有父合同唯一且员工一致的记录标为 `renewal`；缺父、父关系歧义或归属不符保留为 `needs_review`，重复源身份直接拒绝。每条仅包含来源身份/行哈希、分类和过程证据哈希，全部保留并稳定排序。缺父记录仍由下游关联检查阻断，不会因已有分类而允许插入。

固定旧 SQL 归档属于不执行的源码证据，不要求修改其原权限或复制；仍要求所有者、普通单链接文件、禁止符号链接、256 KiB 上限、读取稳定及固定实际字节哈希。业务暂存、配置和输出仍严格采用 0600/0700，单文件32 MiB、总读取128 MiB。输出排他创建并回读验证。纯函数接受的哈希不是独立审批，真实字节真实性必须由 CLI 证明。

本地真实源验证得到357条分类，349条续签候选、8条缺父待处理，数量守恒且重复覆盖被拒绝。该结果来自本地实现验证，不表示已合并部署、生产导入或完整合同功能验收。当前生产候选仍须在最终合并提交上重新生成，源数据不需重新提取。
