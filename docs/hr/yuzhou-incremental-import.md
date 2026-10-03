# 玉舟增量导入接口

`POST /hr/imports/yuzhou/incremental/preview` 接收 `version=1` 的受限规范化包，返回操作 ID 与服务端重算的包哈希。`POST /hr/imports/yuzhou/incremental/:id/commit` 使用该操作的加密暂存包提交；`GET /hr/imports/yuzhou/incremental/:id` 返回不含原始行的计数和修订结果。三个端点均在服务层逐 domain 校验权限：预览和提交要求对应 `manage`，状态要求对应 `read` 或 `manage`；入口的任一权限装饰器不扩大包中其它领域的可见或可写范围。

`sourceKey` 必须为初始导入相同的 `sha256:<sourceIdentitySha256>` canonical source PK。`rowDigest` 不是调用方自行声明的值：它必须等于服务端以 domain、source table/key、source watermark 和递归排序后的 fields 重算的 SHA-256。相同 source key 才代表同一事实对象；不同备份、月份或抽取时间均不产生新人员身份。

当前可写适配器为 `employee`、`profile`、`contract`。员工新增必须带已审核映射的 `employmentStatus`，接口不会把正式在职源事实猜测成 `preboarding`。合同新增必须带已审核映射的 `contractStatus`，允许 `draft|active|expired|terminated|cancelled`，保留来源状态，不能将非 draft 事实重标为 draft。关系通过 `employeeSourceKey` 解析到同范围、同 source system 的增量员工映射；合同类型必须是当前范围已启用的正式 `hr_contract_type` ID。字段集在共享包 `hr-yuzhou-incremental.ts` 中固定，拒绝任意表名、SQL 或字段回调。

同一规范化包哈希只创建一个操作，包哈希递归规范化 JSON，不受嵌套 key 顺序影响。新的 manifest/extractedAt 可以产生新的 operation；只要同一 source key 的 row digest 相同，它仍只记录 unchanged。新行按稳定 `(sourceSystem, sourceTable, sourceKey)` 建立映射；相同行摘要只记录 unchanged。首次命中初始 `legacy_record_map` 时只建立精确 identity binding，绝不把当前现代目标字段当成初始 source baseline；没有原始逐字段 baseline 的记录返回 `INITIAL_FIELD_BASELINE_UNKNOWN` conflict，默认保留平台字段。该 conflict 不是数据已经更新：后续相同或同月回填的 source row 都继续标为 conflict，直到有受控的原始 baseline 补录。既有映射的员工关系或合同类型变化返回 conflict，不静默忽略；这些关系更正仍走正常业务路径。已有员工的来源任职状态变化返回 `NORMAL_EMPLOYMENT_WORKFLOW_REQUIRED` conflict，必须通过现有转正、离职等生命周期流程，不绕过事件和审批。该冲突是首批适配器的待接入边界，后续需衔接正常生命周期办理或受控来源事实路径，并非将既有数据永久只读。源行变化时，服务逐字段比较上次成功的目标基线：目标字段仍等于基线才以乐观版本更新；否则记录 conflict，保留运营维护字段。操作和项修订在同一事务写入。源包和每条源事实仅以现有 Party 敏感数据服务加密存储，审计不捕获请求体。

preview 返回逐项 `create`、`update`、`unchanged` 或 `conflict` 动作及允许查看的字段名和冲突字段名；它不返回任何字段值、身份证明或源事实。合同适配器新增时保留审核后的来源状态，已有合同只允许更新 draft：提交前校验日期边界、合同编号唯一性、员工/合同类型当前范围存在性，并写入正式合同 action journal；不会对已有合同执行激活、签署、发布或生成变更。已生效合同仍必须走正常合同变更流程，不能借增量接口直接修改。

尚未实现的适配器包括附件、组织/岗位、考勤、保险、奖惩、培训、绩效、薪酬及工资历史。工资历史属于后续连续性适配范围，不能被当作支付动作自动拒绝或自动发薪。既有初始批次、`legacy_record_map` 和回执是只读基线；本接口不重放、不改写、不推断删除，也不创建登录账号、薪资支付、发布或签署动作。这三个接口已随 PR #812 部署。2026-10-04 的独立只读观察确认生产 API / Web 运行修订均为 `a0ddbd8fd5cff054162e9e69eb91c6696ad95eda`；该观察只证明当时运行版本，不代表后续新来源批次已提交。

## 现代应用中的操作入口

`/hr/imports` 数据导入工作台已随 PR #813 上线，并从员工档案页提供权限可见的“数据导入”入口。2026-10-04 的独立观察确认生产 Web 运行修订 `bebe8034633833337d3d7eb576b22654fd7554dc`、API 仍为 PR #812 修订；实际生产管理员会话已验证页面和 390px CSS 视口无横向溢出。其他业务角色的真实会话验收仍单独进行。工作台沿用现有登录和当前园区，不需要提取 token 或建立另一套账号。选择已经生成的受限 JSON 文件后，界面只显示文件名、模块、字段标签和数量；文件内容仅留在当前页面内存，并通过现有 preview 接口进入服务端加密暂存，不创建附件记录。

选择文件不会发送或提交数据。先点击“预览数据包”，检查新增、更新、不变和冲突数量，再明确勾选确认并提交。空 `fields` 加完整原始见证的基线恢复包可正常选择；其业务动作应为 unchanged。相同包已有操作时，接口可能只返回操作状态而不重新返回逐项计划，界面会说明这一点；已完成的操作不能再次执行。切换文件、园区或权限会使旧预览失效。

提交超时或响应异常时，保留操作编号，先查询本次状态。查询仍为 previewed 才允许用户再次明确提交，终态直接展示结果，不自动重试。响应编号或已绑定包的记录数不一致时，不能解除未确认状态或恢复提交。刷新、重新登录后可用已保存的操作编号恢复查询；查询要求包内每个模块的 read 或 manage 权限，预览和提交要求每个模块的 manage 权限。

## 首次原始字段基线恢复

已导入的员工 T0 / 合同 T2 可以在每个 item 附带 `initialBaselineWitness`：
`version=1`、`operationId`、`phase=T0|T2`、
`canonicalizationVersion=yuzhou-production-import-canonical-json-v1`、`targetId` 和完整 `projection`。
该 projection 必须包含原模型所有 canonical 字段及 tenant/park（员工 17 个键、合同 32 个键），
并包含原 dependency receipt 对应的 UUID。字段不可删减，也不可用当前目标值重建。
API 按原始 `yuzhou-hr-production-target-canonical-sha256-v1` 算法验证逐行 `target_after_sha256`；
数据库没有逐行 payload hash，本功能不伪造该字段。

服务校验 record → projection receipt → migration batch → active legacy map 的完整链，
要求原 operation/phase/batch 成功、scope/canonicalization 相同、未回滚、来源键/行哈希/目标一致且无歧义。
员工组织/岗位及合同员工/类型依赖也通过原同 operation 的 dependency receipt 链验证。
员工八个支持字段及合同支持字段只能从已验证投影派生；原 probation_end_date 不证明 formalDate。
profile/T5 尚无相同逐行 hash 凭据，明确不支持此基线恢复。

preview 可以写入现有加密操作暂存，但不建立字段基线、不修改业务行、原 map 或原 receipts。
commit 按来源身份 advisory lock 串行，独立追加 `hr_incremental_initial_baseline` 加密 provenance，
再在同一事务执行正常三方比较与目标版本 CAS。新基线的 field/target 比较数据存入加密列，
新增 revision before/after snapshots 也加密；公开响应仍只有身份摘要、字段名和计数。
原有未知 conflict 可以恢复，但历史 revision 永不重写。已接受成功 revision 不可重新定基线；
相同 witness 在后续同对象包中可验证身份后复用，不改变已接受基线，改动 witness 被拒绝。
相同 package 的 commit 重放返回原操作结果。真实同字段现代维护保留为冲突，未改变的来源状态保留现代状态；
来源任职状态变化及已有非 draft 合同的字段/状态变更仍必须由正常业务工作流承接。
仅恢复基线且来源未变化的提交记为 unchanged，不推进业务版本。

`POST /hr/imports/yuzhou/incremental/preview`（加上配置的 `API_PREFIX`，默认完整路径为
`/api/v1/hr/imports/yuzhou/incremental/preview`）的 JSON 请求上限为共享常量
`YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES = 8388608`（8 MiB），最多 2000 items；
它只扩大此预览路由，普通路由保留原 100 KiB JSON 限制。完整 witness 也计入字节数。
CLI 按实际发送的紧凑 UTF-8 JSON 加换行计算长度并拆包；提交时应原样发送生成文件，
不要重新美化 JSON。单条记录超过限制会明确失败，不能截断原投影或删除 witness 字段绕过上限。

实际原始保留文件匹配、部署状态和生产 baseline 接受仍分别验收；合成 PG/HTTP 测试不替代生产写入授权。

## 可重复执行与当前验收状态

已验证的映射和初始来源见证由 `scripts/hr-cutover/build-yuzhou-reusable-incremental-package.mjs`、`prepare-yuzhou-initial-baseline-witness.mjs` 固化。后续相同结构的新来源使用同一规则生成受限 JSON 包，执行预览、确认提交和状态查询；无需重复原始全量分析及 A/B 演练。新包仍必须进行格式、来源身份、摘要、权限及字段冲突校验。来源结构或映射改变、引入尚未支持的业务领域时，需单独验证新增规则。

2026-10-04 已通过正常生产管理员工作台提交三包一次性基线恢复：员工 2000 + 938 条、合同 798 条。三个操作分别为 `88ac08c2-4e2e-436f-be86-d8ac4a4c1f4b`、`75518e3b-ee1e-4e19-afef-9c0d4a384dc3`、`bc6f0483-042d-4a35-aff4-cdd858f77ebc`，均为 committed，合计 unchanged 3736、applied 0、conflicts 0。第一包提交响应超时后，通过原操作编号查询确认成功，没有重新提交。

提交后的独立生产只读观察 [Actions 37148813326](https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/37148813326) 在 `2026-10-03T19:42:27.135Z` 确认 acceptedBaselines 为员工 2938 / 合同 798，原始记录及依赖计数和集合摘要保持一致。与提交前观察 `37147997994` 相比，两领域完整业务行（含版本及审计时间）的摘要均未变化：员工 `4b7e7ebf22c1f75c246e5c97ee72606bf147791326f48eb71bbe681e2ed4197a`，合同 `54d54ea115878c8ac8ea168074c742ffe1b332be32b508978f781a3f2a950084`。这证明原始字段基线已经接受，且这些业务行未被基线恢复改写；不代表其它领域已完成，也不代表七月份以后新数据已导入。
