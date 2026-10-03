# 玉舟人员别名回填规划器

`scripts/hr-cutover/legacy-personnel-alias-backfill-plan.mjs` 是无 I/O 的私有规划库：它既不读取生产数据，也没有 CLI、数据库连接或写入器。它唯一允许产生的建议是 `oldaddr -> native_place` 与 `edulevel -> degree` 的空值填充；所有既有非 `null` 值（包括空字符串）保持原样。输入中的来源观察哈希只是元数据，不是实时保管权或生产授权证明。

调用方必须提供匹配的员工、档案和来源稳定身份集合、同一 tenant/park 范围、未删除且所属正确的行，以及 64 位来源/代码/快照/观察哈希。合同固定绑定已审阅的元数据证据：目录 SHA-256 `8e62d0308c14db70192f5b94f8cc775f2e87032d14f5cbeaee238d1d177f5014`、`u_personinfo2003` 过程 SHA-256 `adf140a230a553b28eca6558dcd324e7ac84fa58f821be23dab75af59437017a`、`web_personinfo_SelectCommand` 过程 SHA-256 `4785a80d7bdc5496c7d64d06567f3a51e3c4fd6aef1f7add7b43d3fc65410868`。这些固定值只证明设计引用了特定元数据观察，绝不证明实时来源保管权、当前数据或生产授权。

重复员工/档案/来源身份、同员工多档案、范围外、删除、未归属、集合不完整、NUL、非法 Unicode surrogate、错误类型或超长度来源/目标值都会失败关闭。来源上限遵照旧列 varchar(50)/varchar(24)，目标上限遵照现代列 varchar(128)/varchar(64)，按 Unicode 码点计数且不截断。这些来源码点上限是必要的大小检查，不能证明 SQL Server varchar 的字节编码合法性；真实演练仍需核对来源编码和保管证据。输出固定为 `productionImport: "HOLD"` 和 `authorizationGranted: false`；`privatePatch` 可以含个人字段值，因此不得写入日志、版本库或普通汇总。返回规划及其所有嵌套对象深度冻结，避免在不更新 plan hash 的情况下篡改私有补丁或计数。

规划结果绑定代码、来源观察、快照、范围、合同、员工/档案清单和每行 before hash。记录按来源稳定身份排序，plan hash 对输入顺序稳定。与现代非空值不同的来源字段以 `preservedDifferentFields` 明确报告并原样保留；同一档案中的其他空字段仍可填充。无可填字段但存在不同现代值时标为 `PRESERVED_MODERN_DIFFERENCE`。这只是保留现值的差异记录，不裁决来源矛盾，也不推测应采用哪个值。同值与空来源都不会生成写入建议。要执行任何未来纠正，必须另行获得实时只读保管/范围核验、独立授权、写入器设计和回放对账，不能把本规划结果当成授权。

验证：`node --test scripts/hr-cutover/tests/legacy-personnel-alias-backfill-plan.test.mjs`。

## 生产只读来源观察器

`scripts/diagnose-yuzhou-personnel-alias.mjs <production-deploy-path>` 是独立的聚合观察器。部署路径必须为规范化绝对路径；程序在部署目录内通过 `docker compose exec -T postgres` 启动 `psql -X -qAt -v ON_ERROR_STOP=1`。整条探测设置 15 秒进程上限、5 秒 SQL statement timeout 和 2 秒 lock timeout，并在只读事务中回滚。psql 使用 `VERBOSITY=sqlstate` 且禁用 context；有限 SQLSTATE 映射为 `PERSONNEL_ALIAS_DB_TIMEOUT_57014`、`PERSONNEL_ALIAS_DB_SCHEMA_INVALID` 或 `PERSONNEL_ALIAS_DB_ACCESS_DENIED`，未知、格式异常或多行错误统一为 `PERSONNEL_ALIAS_PROBE_FAILED`。错误输出不包含部署路径、原始 stderr、SQLSTATE 文本或数据库内容；分类不会放宽查询或超时，也不会改变 HOLD。

可选 `--explain <production-deploy-path>` 仅对同一精确 SELECT 请求 `EXPLAIN (FORMAT JSON)`，不使用 `ANALYZE`，仍在相同只读事务及超时内。该模式只重建固定 PostgreSQL 节点类型、节点序号/父节点、估算行数/宽度/成本、可选 Planning Time 和受限 JIT 开关/函数数；过滤器、输出别名、表/索引名、条件、SQL 文本及其他原始计划属性都会被丢弃。最多返回 2048 节点、64 层；未知节点或无效/超界计划失败关闭。结果使用独立 `kind`，并固定 `executedQuery: false`、`productionImport: HOLD`、`authorizationGranted: false`、`writerPresent: false`。工作流默认不请求计划，只有同时启用 `diagnose_personnel_alias` 且显式启用默认关闭的 `diagnose_personnel_alias_explain` 才加入固定 `--explain` 参数；非 true/false 值在 SSH 前拒绝。

观察范围固定为 tenant `10000001`、park `20000001`、T5 来源 `person_core` / `dbo.person.core_residue`。它要求唯一的已成功 T5 followon 与已成功、绑定范围一致的父 core operation；每个来源必须有同 operation、同 identity、同 row hash 的来源 receipt。映射人员还须由父 operation 的 T0 `hr_employee` insert record、成功 T0 migration batch、T0 projection receipt、活跃 `yuzhou-v10` / `dbo.person` `legacy_record_map` 和同范围未删除员工共同证明。这里的 T0 人员身份哈希属于 `dbo.person`，不等于 `person.core_residue` 的来源哈希；二者只通过存储的 `owner_record_map_id` / employee 关系绑定，不按姓名或人员编码猜测。T5 followon 自身也必须有成功 batch。

现代档案只在同 operation 的 `hr_employee_profile` receipt 与档案行同时匹配员工、范围、`legacy_source_identity_sha256` 和 `legacy_source_row_sha256` 时计入；该员工在固定范围内必须恰有一条未删除档案。原始值只从同 operation identity registry 与 archive receipt 绑定的 `restricted_safe_projection.legacyFields.oldaddr/edulevel` 读取。观察器不选择、解密或输出 T5 来源密文，也不选择来源原始行、人员身份或任何字段值。字段结果仅是计数：现代列 SQL NULL 且来源为合法非空字符串、来源与现值相等、来源与现值不同、来源缺失/非法，以及单独标记的纯空白来源。纯空白不被 trim 后作为建议值，出现时观察分类保持 `NOT_READY`。

`sourceSetSha256` 对观察到的来源行（包括缺少 receipt 的行）按 identity 的 C 顺序生成 UTF-8 文本行 `identity:rowhash`，以 LF 连接且无末尾 LF 后计算 SHA-256；身份和值行都不会返回。该摘要只能与保留在受控本地的来源清单摘要对照，不能单独证明来源保管权、授权或可写入性。固定 schema、额外键、类型错误或数量不守恒会失败关闭；来源重复、缺少 receipt、owner 状态异常、重复 profile、archive/registry 歧义及缺失 archive 以聚合计数报告并使分类保持 `NOT_READY`。当全量 receipt 完整，而未映射历史记录仍存在时，所有已映射记录都通过唯一 T0 owner、profile 与 archive 绑定可标为 `OBSERVED_MATCHED_SUBSET_FOR_REVIEW`；未映射记录继续计数且不进入任何填充值建议。全量唯一映射才可标为 `OBSERVED_READY_FOR_REVIEW`。空范围分类为 `NOT_READY`。所有输出始终标记 `productionImport: HOLD`、`authorizationGranted: false`、`writerPresent: false`；没有写库路径。

只运行不连接数据库的合约测试：

```sh
node --test scripts/hr-cutover/tests/legacy-personnel-alias-observation.test.mjs
```

这些 fake-runner 与 SQL 结构检查验证参数、限时、固定 schema、脱敏和失败关闭行为；它们没有执行真实 PostgreSQL，也不能作为生产数据观察或回填证据。父任务需单独执行真实只读查询并核对保留清单摘要。观察器结果不会替代回填计划、独立授权或之后的写入与对账验收。

### 通过部署工作流观察

需要实时核对时，在 GitHub Actions 的 `Deploy Production` 手动运行已有 `diagnose-production-runtime-revision` 模式，并显式勾选 `diagnose_personnel_alias`。需要估算查询计划时，再显式勾选默认关闭的 `diagnose_personnel_alias_explain`。分别填写当前期望的 API 与 Web **已合并运行镜像** commit 到 `expected_api_commit` 和 `expected_web_commit`；workflow 的 `GITHUB_SHA` 是观察器代码版本，三者各自独立。若服务近期没有重建，期望值应填实际正在运行的已合并服务 SHA，不要把观察器分支 SHA 冒充服务镜像 SHA。观察器通过 SSH stdin 运行在生产部署目录，不传输候选仓库，也不部署候选分支。

别名 JSON 只在观察器与配对的运行镜像观察都成功后作为 `personnel-alias-observation` artifact 留存 7 天。`NOT_READY` 是有效的只读结果，计数仍保存在 artifact 中；失败时不上传。关闭该布尔输入时不会运行人员别名查询或生成对应 artifact。此模式不会触发迁移、seed、应用 build/restart、release marker 或部署清理。部署路径边界验证先于 SSH observer 步骤。

部署路由回归：`node scripts/e2e/yuzhou-personnel-alias-route.contract.mjs`。该合约也作为生产部署 governance validation 自动执行；同一验证阶段运行 observer fake-runner 合约。它们验证的是工作流路径与固定输出契约，不代表本次已发生实际 production workflow 运行。
