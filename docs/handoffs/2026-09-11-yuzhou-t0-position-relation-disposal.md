# 玉舟 T0 岗位父子/组织引用处置（切片 A）— 只读核验与实现交接

- 日期：2026-09-11
- 分支：`codex/hr-position-relation-disposal-v1`（基于 origin/main 563af3a1）
- 状态：实现完成，合同测试通过，生产导入保持 HOLD
- 上游交接：`docs/handoffs/2026-09-09-full-pair-retained-input-gap.md`

## 1. 问题定义

T0 保留源（manifest `19841812bfc607f914c45f4877350e7a6903f2440e86a12d49f8645a744772a0`，
套件 `staging-prodcurrent20260907165957t0`，138 组织 / 18 岗位 / 2949 员工）中：

- 7 条岗位 `parentPositionCode` 非空且未匹配到任何岗位编码（旧表 `dbo.job.parentjob` 存的是名称或不存在实体的文本）
- 2 条岗位 `departmentCode` 非空且未匹配到任何组织编码（`dbo.job.department` 存 `000001`/`000023`）
- 7 条受影响岗位被 27 名员工引用

此前实现对这些引用一律隔离（`POSITION_PARENT_UNRESOLVED` / `POSITION_ORG_REQUIRED`），
导致 7 岗位 + 依赖员工全部隔离。

## 2. 证据链（只读核验结论）

| 证据 | 来源 | 结论 |
|---|---|---|
| `dbo.job` DDL | `schema_tables.sql` 885–904 行 | `job` PK varchar(30)；`parentjob`/`department` varchar(30) **无 FK 约束** |
| 存储过程使用 | 全部 169 个存储过程/函数源码 | `parentjob` **零命中**（无任何程序读取） |
| 岗位全量性 | `extract-yuzhou-t0.sh` positions 查询 `SELECT ... FROM dbo.job`（**无 WHERE**） | 18 行即旧库 `dbo.job` 全量 → "董事会 / 主管会计 / 设计经理" **确实不是岗位**（非编码也非名称） |
| 组织全量性 | 同脚本 departments 查询（无 WHERE） | 138 行即全量 → `000001`/`000023` **确实不是组织** |
| 既有契约 | `legacy-organization-position-field-map-v1.json` resolutionRule `JOB_PARENTJOB_UPTO_SEPARATION_V1` | 结论 `PARENTJOB_AND_CODE_PREFIX_ARE_DISTINCT`，parentjob 非空 7 行、与编码前缀零等价 |
| 名称唯一性 | 18 岗位 `positionName` 计数 | "董事长"(000)、"总裁"(000006) 唯一；"董事会/主管会计/设计经理" 无同名岗位 |

**结论**：`parentjob`/`department` 是旧系统遗留的自由文本字段，无程序语义、无对应实体时引用悬空。处置采用"映射 + 保留原文"，不猜测、不伪造父关系。

## 3. 处置决策（7 岗位 + 27 员工）

| 岗位 | 名称 | 父引用处置 | 组织引用处置 |
|---|---|---|---|
| 000 | 董事长 | 保留（"董事会"无对应实体）→ 根 | 保留（"000001"无对应组织）→ 根 000 |
| 000000 | 会计 | 保留（"主管会计"无对应实体）→ 根 | 空 → 根 000 |
| 000002 | 总经理 | 保留（"董事会"无对应实体）→ 根 | 保留（"000023"无对应组织）→ 根 000 |
| 000005 | 设计师 | 保留（"设计经理"无对应实体）→ 根 | 空 → 根 000 |
| 000006 | 总裁 | **映射**（"董事长"→ 000） | 空 → 根 000 |
| 000007 | 总监 | **映射**（"总裁"→ 000006） | 空 → 根 000 |
| 000014 | 总裁助理 | **映射**（"总裁"→ 000006） | 空 → 根 000 |

汇总：名称映射 3、父引用保留 4、组织引用保留 2；无循环（拓扑归一化后 cyclic 为空）。
27 名员工（000×1、000000×12、000002×2、000005×7、000006×1、000007×2、000014×2）
依赖的岗位全部转为 insert，员工侧无独立阻塞（组织/岗位引用全匹配），依赖解除后全部可插入。

## 4. 代码变更

| 文件 | 变更 |
|---|---|
| `contracts/production-import-target-model-v1.json` | modelVersion → `2026-09-11.1`；`hr_position` fieldWhitelist/nullableFields/canonicalFields 增加 `legacy_parent_reference`、`legacy_department_reference`（与 DDL varchar(30) 一致） |
| `materialize-production-t0-decision-candidates.mjs` | ① `projectLegacyT0ExtendedFields` 投影两个 legacy 引用字段（保留原值）；② `orderLegacyPositionRows` 增加可选 `resolveParent` 解析器（向后兼容，编码语义默认不变）；③ `buildCandidates`：非空未解析组织 → 保留原文 + 挂根 000；父引用编码匹配 → 直接父，名称唯一匹配 → 映射，无对应/歧义/自引用 → 保留原文 + 无父插入；④ `summarizeLegacyT0Relations` 增加 `parentNameMappedRows` / `parentReferenceRetainedRows` / `orgReferenceRetainedRows` 计数（既有键语义不变） |
| `yuzhou-production-import-t0-decision-candidates-contract.mjs` | audit 断言增加三键；department 用例 unknown → insert + `legacy_department_reference` + 依赖员工不再隔离；新增父引用 mapped / retained / self-cycle 三场景合成用例 |

## 5. 验证结果

- `yuzhou-production-import-t0-decision-candidates-contract.mjs`：PASS（含映射/保留/自引用/组织三态）
- `yuzhou-t0-full-inventory-compat.contract.mjs`、`yuzhou-production-job-state-source-revalidation-contract.mjs`、`yuzhou-t0-extract-contract.mjs`、`execute-production-import.contract.mjs`、`yuzhou-production-t3-materializer-contract.mjs`、`yuzhou-production-import-t1-decision-candidates-contract.mjs`：全部 PASS
- 真实 staging 只读验证（`/tmp/t0-slice-a-verify.mjs`，不写库）：7 岗位处置与 27 员工影响与上表完全一致
- ESLint：**跳过**（worktree 未 `pnpm install`，node_modules 缺失；已记录，待依赖安装后补跑）
- 数据库往返验证：不属于切片 A（切片 B 覆盖）

## 6. 既存失败（与本次变更无关，未修复）

`yuzhou-organization-position-field-map-contract.mjs` 子测试 4 断言
`load-yuzhou-t0.sh` 含文本 `T0 position references an unknown organization`，
但 origin/main（563af3a1）的 `load-yuzhou-t0.sh` 仅含 `unknown parent position` 与
`omitted legacy upto` 两条 RAISE EXCEPTION。该失败在 origin/main 上同样存在（既存），
修复涉及 load 脚本 PL/pgSQL 语义决策，超出切片 A 范围，另行处理。

## 7. 下一动作（切片 B 前置）

- 在 `--staging` 指向同一保留套件（manifest 19841812…）时重新物化 T0 决策候选，
  确认新候选 countByDisposition（7 岗位与 27 员工从 quarantine 转为 insert 后重新冻结）
- 岗位 `reports_to_position_id` / `hierarchy_level` / `sort_order` 与员工
  `legacy_jobstate_code/name` 的数据库字段往返验证（切片 B）
- 候选再生成后更新三端 SHA（候选 / 远端合并 / 运行时）
