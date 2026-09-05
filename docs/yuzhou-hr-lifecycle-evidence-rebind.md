# HR 生命周期证据同步（2026-09-05）

本记录描述主线 `c54bcb89` 到 PR #630 的历史证据修复。后续家庭七字段切片又明确修复了
生日的 API 日期投影，服务字节因此再次变化；最新实现及验证见
[家庭档案七字段前端接线](./yuzhou-hr-family-record-fields.md)。下文 hash 保留为当时审阅依据，
不作为后续候选的当前文件 hash。

## 根因与修复边界

主线 `c54bcb89` 的兼容进度命令失败于
`PROGRESS_INPUT_INVALID: knowhow field mapping: KNOWHOW_FIELD_EVIDENCE_DRIFT: modern target:runtime_service`。

对比 #618 的合并提交 `23371b10` 与父提交，`hr-lifecycle.service.ts` 只有一行变化：
`PartySensitiveDataService` 的导入从物业目录改为共享安全目录。技能和家庭成员方法未改变，
但两份合同仍绑定旧整个文件的 SHA-256，校验器因此正确拒绝旧证据。

- 旧文件：`af9a41a04695051268401ebe1b0e7445046e1bf6b7a6c7acd0dcf9704021ef43`。
- 当前文件：`1543271a61a74f23fee99b94b43b249cd217f0c64940bfd788a1d1a02dd1378a`。
- 同步技能字段合同一处、家庭成员合同三处服务证据引用；不修改运行代码或校验器。
- 技能映射仍为 4/5，等级字典及 proficiency 对应仍是明确缺口；不增加兼容信用。
- 新增错误 runtime hash 的拒绝测试；不会把任何未来源码变化自动认可为等价。

此片属于 M0 证据维护，不能记作新增字段、业务逻辑或页面复现。

专项检查还发现家庭合同中的两个既有文件绑定过期：

- `packages/shared/src/hr.ts` 相对 `4622bcd0` 仅新增人员编码规范化与校验辅助代码；家庭权限常量未改变。
- `apps/web/lib/hr-api.ts` 相对 `49f914ca` 仅新增绩效 DTO 与查询入口；家庭 `employeeRecords` 调用未改变。

审阅上述完整差异后同步这两项绑定，保留各自的错误哈希拒绝测试。
两份合同字节变化后，同步冻结清单中的 `FIELD_KNOWHOW` 和 `ROUTINE_FAMILY_QUERY`
合同哈希；不改冻结资格、旧源身份、映射内容或信用。只通过 progress 测试不足以证明
这条依赖链有效，必须同时通过家庭契约与冻结清单契约。

冻结清单的直接消费者 `legacy-employment-event-cross-layer-v1.json` 同步其清单引用。
该合同的 `hrPermissions` 同样受上述辅助函数新增影响；其 `apiService` 也仅受 #618
同一导入路径调整影响：父提交文件哈希为 `241ca3b6c32f41ba17764ac9d37919d6ebadaf9af2b04187714a58659bdad0ad`，
当前为 `b257a9c1a3c441377ec63bc164875f572458a64c4eed6405274199067af133ee`。
审查后同步这些明确引用，并运行异动跨层契约；不把静态跨层检查当作真实角色或浏览器验收。

## 冻结清单与进度输入的实际接口遗漏

冻结清单的 `PROGRESS_ENGINE` 和 `MILESTONE_ROADMAP` 仍绑定 `031c9361` 的版本。
对比当前主线，进度引擎已新增必需的 `performanceRuntimeCoverage` 和已登记的绩效打印例程，
路线图已增加用户要求的 P0-P4 独立产品验收。此处不是无行为变化的重绑定：冻结清单的
输入适配器必须显式接入新绩效覆盖合同和例程合同，并对输入文件做哈希绑定。

修复仅使冻结清单消费当前已存在的进度输入，不修改进度算法、业务实现、分母或源证据。
冻结候选数由旧清单的 5 项同步到当前进度的 6 项，并不新增第七项已验证例程。
生产准入仍为空、各操作仍禁止；路线图更新不是 P0-P4 已通过的证明。

其他四个合同中还发现此前 shared HR/Web API 修改留下的独立旧引用：岗位人数刷新、
编制差异报告、集团 Web 组织跨层、学历来源链。本片不自动重绑定这些合同，
也不声称整个仓库的证据已全部有效。

## 生产距离口径

当前生产入口在代码中接入 T0、T1、T2、T3、条件性绩效三阶段与 T5_NONFILE。
这只证明执行路径存在，不证明当前真实载荷、部署版本和导入结果已经核验。
T4 全量历史工资、照片附件二进制尚不在该入口的支持域列表中；不能把隔离 loader
已经运行解释成这些域已可从生产入口执行。完整范围见 `yuzhou-hr-production-import-entrypoint.md`。

`readDefaultLegacyCompatibilityProgressInputs()` 明确提供 `productionEvidence: []`。
所以默认输出的 0/8 表示本次没有输入生产证据，不是扫描生产后发现八项全部缺失。
旧的恢复、备份或演练证据应按具体批次和有效性复用，不能因为默认分数为零而重跑。
版本化执行合同仍为 HOLD；本片不改变目标登记、执行授权、生产数据库或既有业务数据。

## 验证范围

只执行受影响的 Node 契约和元数据进度命令，不读取源行值、不连接数据库、不启动容器，
也不运行 A/B、全量提取、构建或部署。

基于主线 `c54bcb894d01bfef14856beee43328eece7a878d` 的本地结果：

| Node 契约 | 结果 |
| --- | --- |
| `yuzhou-legacy-knowhow-field-map-contract.mjs` | 5/5 PASS |
| `yuzhou-legacy-family-query-parity-contract.mjs` | 7/7 PASS |
| `yuzhou-legacy-compatibility-progress-v2-contract.mjs` | 11/11 PASS |
| `yuzhou-legacy-frozen-compatibility-migration-manifest-contract.mjs` | 10/10 PASS |
| `yuzhou-legacy-employment-event-cross-layer-contract.mjs` | 8/8 PASS |
| `yuzhou-performance-calculation-print-parity-contract.mjs` | 7/7 PASS |
| `yuzhou-hr-enterprise-rewrite-roadmap-v2-contract.mjs` | 7/7 PASS |

以上文件均在 `scripts/e2e/`，以 `node --test` 联合运行：55/55，无跳过。
变更的四个 `.mjs` 文件 `node --check` 通过，`git diff --check` 通过。
未运行应用全量 lint/typecheck/build：本片没有变更 API/Web/共享包或依赖，Node 专项直接覆盖
修改的清单输入适配器和合同。未验证生产运行 SHA、真实角色/API 或桌面/移动端行为；
本地测试不能作为部署、导入或完整功能等价证据。
