# Slice P0-1：玉舟核心字典物化设计（2026-08-28）

## 目标与不可突破的边界

首批只解决三组字典及其确定性转换：`jobstatecode`、`readjustitem/readjust.state`、`compacttypecode/compact.state`。不得凭中文常识补值；只有来自只读源库的 code/name/state distinct 快照、行数与 SHA-256 才是输入。未知、空白、重复、同码异名、同名异码全部 fail-closed：进入 staging quarantine/raw，禁止写入在线 `hr_employee`、正常统计或 active 合同。

本 Slice 不运行生产 loader，不修改历史记录，不用 rollback 删除既有业务数据。目标是形成可版本化、可签署、可重放的 dictionary decision，并让 T0/T1/T2 loader 只消费已批准的决定。

## 已证实来源与现有目标模型

| 域 | 真实来源 | 当前转换 | 当前目标 | 已确认问题 |
|---|---|---|---|---|
| 员工状态 | `dbo.person.jobstate`；reviewed inventory 中存在 `dbo.jobstatecode`，但当前 T0 extract **未提取该表** | `load-yuzhou-t0.sh`: `1→active, 6→probation, A→active+contractor, 5/B→suspended, 其余→departed` | `hr_employee.employment_status/employment_type`；员工 list/detail `/hr/employees` | silent `ELSE departed` 会把未知值错误离职；没有字典快照和签署版本。 |
| 异动类型 | `dbo.readjustitem.readjustitem,id`；事件 `dbo.readjust.readjusttype,state` | 已提取字典；transform 仅 `就职→hire, 调职→transfer, 离职→departure, 复职→resume`，其他 `legacy_unknown/needs_review` | `hr_employment_event.event_type,status,legacy_event_type,legacy_state,migration_decision`；`GET /hr/employees/:id/events` 和 statistics | `hire/departure` 与在线 `start_probation/confirm_employment/depart` 不同词汇；`readjust.state` 没有批准映射；unknown 仍可能被装入事件并污染统计。 |
| 合同类型 | `dbo.compacttypecode.compacttype,myorder` | typeName/myorder 直接写 `hr_contract_type(type_name,type_code)` | `GET /hr/contract-types`、合同表单与详情 | `myorder` 是否稳定业务 code 未经签署；同名/同码冲突没有显式 quarantine。当前提取记录固定预期 4 行，只能作为本快照证据，不能硬编码业务含义。 |
| 合同状态 | `dbo.compact.state` distinct | `生效→active, 解除→terminated, 其他→needs_review` | `hr_contract.status` CHECK: `draft/active/expired/terminated/cancelled/needs_review`；contracts APIs/page | 未提取独立 distinct 清单；空值和其他状态均被降为 needs_review，但未记录逐值决定；不能判断 expired/cancelled。 |

现有在线事件编号约束来自 `000266_hr_employee_identity_event_number.sql`：`start_probation/confirm_employment→JZ`、`transfer/suspend→DZ`、`depart→LZ`、`resume→FZ`。历史导入保留 legacy event no，不应为历史事件重新生成在线编号。

## 数据模型：批准决定与原始字典分离

新增迁移建议名：`database/migrations/000271_hr_legacy_dictionary_decision.sql`（实施前 fresh fetch 后用“当前最大号+1”，若 000271 已占用必须改号，禁止重复）。

新增两张 append-only、tenant+park+source scoped 表：

### `hr_legacy_dictionary_version`

- `id uuid PK`
- `tenant_id varchar(64) NOT NULL`, `park_id varchar(64) NOT NULL`
- `source_system varchar(32) CHECK = 'yuzhou-v10'`
- `dictionary_code varchar(64) CHECK IN ('employee_job_state','employment_event_type','employment_event_state','contract_type','contract_state')`
- `source_table varchar(128) NOT NULL`
- `source_snapshot_sha256 char(64) NOT NULL`
- `source_row_count integer CHECK >= 0`
- `status varchar(16) CHECK IN ('draft','approved','superseded')`
- `approved_by uuid NULL`, `approved_at timestamptz NULL`; approved 状态二者必须非空
- `decision_note varchar(500)`, audit columns
- 唯一：`(tenant_id,park_id,source_system,dictionary_code,source_snapshot_sha256)`；同 scope+dictionary 只允许一个 approved（partial unique index）。

### `hr_legacy_dictionary_item`

- `version_id uuid FK`, scope columns（复合 scope FK/trigger 防跨园区）
- `source_code varchar(128)`, `source_name varchar(255)`, `source_value varchar(255)`；三者至少一个非空
- `source_identity_sha256 char(64)`, `source_row_sha256 char(64)`
- `decision varchar(24) CHECK IN ('map','raw_only','reject')`
- `target_domain varchar(64)`, `target_value varchar(64)`；decision=map 时必填，否则必须 NULL
- `reason_code varchar(64) NOT NULL`，如 `APPROVED_MAPPING/UNKNOWN_SOURCE_VALUE/DUPLICATE_SOURCE_CODE/AMBIGUOUS_SEMANTICS`
- `review_note varchar(500)`
- 唯一：`(version_id,source_identity_sha256)`；同 approved version 内 source_code/source_value 的规范化键不得多目标。

数据库函数 `hr_resolve_legacy_dictionary(...)` 只能读取 approved version；0 行或多行均抛异常，不返回默认值。不要把决策塞进通用 JSON 字典或前端常量。

## 字段约束与首批决定规则

### employee_job_state

- 输入必须新增为 `job-state-types.raw.json`: 从 `dbo.jobstatecode` 提取真实 code/name/排序字段（字段名先由 inventory/SQL Server metadata verifier 确认），并另取 `SELECT jobstate,count(*) FROM dbo.person GROUP BY jobstate`。
- 目标只允许当前 `hr_employee` 约束实际接受的值：employment status `active/probation/suspended/departed`；employment type 只能在有独立源证据时设置，**不得再由 jobstate=A 推导 contractor**，除非 HR 对该语义签署。
- 所有 person.jobstate 必须在批准 version 恰好命中一项；否则整条 employee quarantine。删除 T0 `ELSE departed`。

### employment_event_type / employment_event_state

- 字典输入：现有 `employment-event-types.raw.json` 加 `readjust.state` distinct+count 新文件。
- canonical event type 只允许在线约束词汇：`start_probation,confirm_employment,transfer,suspend,depart,resume`；若业务认为历史“就职”不能区分试用/正式，则保持专用历史 canonical 值或 raw-only，不能武断映射二者之一。实施迁移 CHECK 前先让 HR 签署。
- `legacy_event_type/state` 永久保留原文；`migration_decision!='accepted'` 的事件不得进入正常 statistics。statistics SQL 必须显式过滤 accepted，另提供 review count。
- 历史 `legacy_event_no` 保留；JZ/DZ/LZ/FZ 格式约束只适用于 `is_historical_import=false`。

### contract_type / contract_state

- `compacttypecode` 的 `myorder` 先保存在 `source_code`，不能在未签署时声称是语义 code；批准后可生成稳定 `YZ-<source identity 前缀>` target code，或由 HR 指定业务 code。
- 新增 `contract-states.raw.json`: `compact.state,count(*)`，空值单独一项；不得只靠 transform 内两条字符串判断。
- target status 只允许数据库 CHECK 中六值。`needs_review` 是隔离状态，不得出现在“有效合同”统计、到期提醒或阻止员工新合同的 active 判定中。
- 同 scope type code/name 冲突必须使整批 type materialization 失败，不能 `ON CONFLICT` 覆盖。

## 实施文件清单

| 层 | 新增/修改文件 | 内容 |
|---|---|---|
| migration | 新增 `database/migrations/000271_hr_legacy_dictionary_decision.sql`（编号实施时复核） | 两表、CHECK、partial unique、scope integrity、approved immutable trigger、resolver function；只 expand，不回写既有数据。 |
| entity | 修改 `apps/api/src/modules/hr/entities/hr.entities.ts`；修改 `apps/api/src/modules/hr/hr.module.ts` | 增加 `HrLegacyDictionaryVersionEntity/ItemEntity` 并注册；不把 raw source 暴露给普通员工。 |
| DTO | 新增 `apps/api/src/modules/hr/dto/hr-legacy-dictionary.dto.ts` | list query、create draft、item decision、approve；枚举白名单、SHA 格式、长度、分页上限；approved 后禁止更新。 |
| service | 新增 `apps/api/src/modules/hr/hr-legacy-dictionary.service.ts`；修改 `hr.service.ts` statistics | scope lock、两人复核可选、批准事务、source coverage 守恒；statistics 排除 unresolved；不允许 service fallback。 |
| API | 新增 `apps/api/src/modules/hr/hr-legacy-dictionary.controller.ts`；修改 module | `GET /hr/legacy-dictionaries`、`GET /:id/items`、`POST /drafts`、`PUT /:id/items/:itemId`、`POST /:id/approve`；全写路由 idempotency+audit。 |
| shared permission | 修改 `packages/shared/src/hr.ts`、`packages/shared/src/index.ts`；新增前向 migration seed permission | `HR_LEGACY_DICTIONARY_READ/MANAGE/APPROVE` 三权分离；批准者不能只凭 MANAGE；不授予 self/team 默认角色。 |
| extract | 修改 `scripts/extract-yuzhou-t0.sh`、`extract-yuzhou-t1-employment-events.sh`、`extract-yuzhou-t2-contracts.sh` | 增加 jobstatecode 与各 state distinct+count；metadata allowlist；manifest SHA/row count；源库仍只读、非 sa。 |
| transform/load | 修改三个 transform/load；新增 `scripts/hr-cutover/verify-yuzhou-dictionary-coverage.mjs` | transform 不内置猜测 map；loader 必须传 approved version SHA；unknown/ambiguous quarantine；写 mapping version id 到 source snapshot/batch evidence。 |
| page | 新增 `apps/web/app/hr/migration/dictionaries/page.tsx`、`LegacyDictionaryClient.tsx`、局部 CSS；修改 HR menu/route contract | 仅 HR migration 管理员可见；按字典显示源值、数量、目标、reason、coverage；未知红色阻断；390px 卡片视图无横向溢出。 |
| fixture | 新增 `scripts/e2e/fixtures/yuzhou-dictionaries/{job-state,event-type,event-state,contract-type,contract-state}.{positive,unknown,duplicate}.json` | 全部是人工脱敏合成值，不提交真实 inventory/PII；正向 fixture 只复现结构，不宣称真实值。 |
| unit/contract | 新增 `apps/api/src/modules/hr/hr-legacy-dictionary.contract.spec.ts`、`hr-legacy-dictionary.service.spec.ts`、`scripts/e2e/yuzhou-dictionary-materialization-contract.mjs` | unknown fail、重复拒绝、无 approved version 拒绝、跨 scope 拒绝、approved immutable、权限矩阵、统计隔离。 |
| PG/e2e | 新增 `apps/api/src/modules/hr/hr-legacy-dictionary.pg.spec.ts`、`scripts/e2e/yuzhou-p0-dictionary-rehearsal.mjs` | 真实约束、并发 approve、幂等重放、T0→T2 小样本守恒、逆序清理 residual=0。 |

## API 与页面验收矩阵

- `READ`：只能看到脱敏 source value、count、decision、reason；不能读取 staging 文件路径或 raw person 行。
- `MANAGE`：可创建 draft 和编辑 item，不可 approve。
- `APPROVE`：需同时具备 READ；建议强制 `approved_by != draft.update_by`。批准时重新核对 snapshot SHA，漂移即 409。
- HR 管理页提供 coverage：`observed distinct = mapped + raw_only + rejected`，任一差额阻断批准。
- 普通员工、部门经理访问所有 dictionary endpoints 均 403；菜单不可见不是唯一安全措施。

## 回滚与完成门禁

迁移为 forward-only，数据库 rollback 验收不是 DOWN migration，而是 rehearsal 隔离资源中的逆序数据清理：先 batch maps/events/contracts/employees，再 dictionary items/version；清理后新增表业务行 residual=0，schema 保留。approved decision 不允许在线删除或修改，只能新建新 snapshot version 并 supersede；旧 batch 永久指向旧 version。

完成必须同时满足：

1. 真实只读字典快照的 SHA、distinct count、使用频数齐全，且无凭空补值。
2. HR 对每个 observed 值签署 map/raw_only/reject；未知值未进入在线目标。
3. source count = mapped load + quarantine，重复执行 target 增量为 0。
4. 无 approved version、SHA 漂移、跨园区、重复 code/name、并发 approve 均 fail-closed。
5. unit/contract/PG/e2e、API 三权限矩阵、桌面与 390px 页面通过。
6. Rehearsal A/B 使用独立数据库和 staging，结果散列一致；逆序清理 residual=0。
7. 普通部署日志证明未调用任何 Yuzhou extractor/loader；production historical import 继续 HOLD，直到既定三方签署门禁满足。

## 当前证据文件

- `scripts/extract-yuzhou-t0.sh`、`scripts/load-yuzhou-t0.sh`
- `scripts/extract-yuzhou-t1-employment-events.sh`、`scripts/transform-yuzhou-t1-employment-events.mjs`、`scripts/load-yuzhou-t1-employment-events.sh`
- `scripts/extract-yuzhou-t2-contracts.sh`、`scripts/transform-yuzhou-t2-contracts.mjs`、`scripts/load-yuzhou-t2-contracts.sh`
- `database/migrations/000237_hr_employment_event_legacy_compatibility.sql`
- `database/migrations/000238_hr_contract_history.sql`
- `database/migrations/000266_hr_employee_identity_event_number.sql`
- `apps/api/src/modules/hr/entities/hr.entities.ts`、`hr.controller.ts`、`hr.service.ts`
- `apps/web/app/hr/contracts/HrContractsClient.tsx`
- `scripts/e2e/yuzhou-t0-*.mjs`、`yuzhou-t1-employment-events-contract.mjs`、`yuzhou-t2-contracts-contract.mjs`

本设计不声称已知道 jobstatecode、readjust.state 或 compact.state 的完整真实值；它要求下一实现切片先从受控只读源产生证据，再允许字典决定进入代码路径。
