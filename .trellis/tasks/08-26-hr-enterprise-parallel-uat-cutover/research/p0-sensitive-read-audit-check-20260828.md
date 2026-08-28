# P0-5 HR 敏感读取 required-audit 独立审计（2026-08-28）

基线：统一候选 `392a83dd` / 文档合并候选 `d2debeaa`。本审计只读扫描 Controller、Service、文件授权、生产 seed 与现有测试；未执行生产、迁移或历史/照片导入。

## 结论

**NO-GO。** 工资条、合同详情、保险台账和受保护文件的多数显式路径已经采用“scope 查询/投影 → `recordOperationRequired` → return/headers/stream”顺序，required audit 失败会阻止正常 body 返回；但存在一个可直接利用的文件列表旁路，以及合同薪资审计分类不完整。现有测试还不足以证明所有 metadata/header/stream 在跨树、直接 UUID 和 audit/storage 故障下零泄漏。

## 路由级核对

| 数据面/路由 | Controller permission | Service scope / projection | Audit 顺序 | 结论 |
|---|---|---|---|---|
| `GET /hr/payroll/runs` | `HR_PAYROLL_READ` | tenant+park，全园区 HR 投影 | 查询、投影后 required audit，之后 return | 基础通过；需 PG 证明 audit fail 零 body |
| `GET /hr/payroll/runs/:id/payslips` | `HR_PAYROLL_READ` | run UUID 同 tenant+park；返回员工 id、金额、compensation snapshot | run 存在检查及明细查询后 required audit，之后 return | HR-only 可接受；直接 UUID 跨 park safe not-found，仍缺真实 PG 负例 |
| `GET /hr/payslips/me` | `HR_PAYSLIP_SELF_READ` | actor→active employee；仅 confirmed；投影不含 employeeId/compensationSnapshot | 查询/投影后 required audit，之后 return | 顺序正确；软删/未绑定员工及 audit fail 需 PG |
| `GET /hr/payroll/history`、`/:id`、`/:id/items` | history read/self read | self 强制 employee id + published；HR 为 park；items 先调用 detail scope/audit再取明细 | 每次最终数据返回前 required audit；items 会写 detail audit及items audit | 基础正确；双 audit 中第二次失败必须证明 items 零返回；query 的 `employee_id` 对 self 不得改变 self 条件 |
| `GET /hr/contracts`、`/me`、`/:id` | contract park/team/self atoms | park/null、managed tree、self；直接 UUID越界为 not-found；salary 仅 park + `HR_COMPENSATION_READ` | 投影后 required audit，之后 return | scope 良好；**详情包含薪资时 audit fieldGroups 仍只有 `employment_contract`，缺 `financial/compensation`，NO-GO** |
| `GET /hr/insurance/periods`、`/me`、`/:id` | insurance park/team/self atoms | park 看 employer/total；team 看个人 employee/supplement 汇总但不看 items；self 看本人 item 明细且隐藏 employer/total | 投影后 required audit | 技术顺序正确；经理是否可见个人缴费/补充金额是未签署产品决策，不得默认“team read=全部个人金额” |
| `GET /files?biz_type=...&biz_id=...` | 文件列表通用 permission + domain reference access | 显式 HR biz_type 先 `assertReferenceAccess`，再 scope 查询，再 required audit，再安全 metadata projection | 正确 | 显式查询基础通过 |
| `GET /files/:id` | 文件读取 + domain reference access | tenant/park UUID，pending owner，domain scope，再安全 metadata projection | reference authorization 后 required audit，之后 return | 基础通过 |
| `GET /files/:id/download` | `FILE_DOWNLOAD` + domain download authorization | tenant/park UUID，domain reference access，resolve storage；required audit 成功后才设置 Content-Type/Length/Disposition 和创建 stream | 审计位于 headers/stream 之前 | 顺序正确；需真实 stream 故障和 header 断言 |

## 精确 NO-GO

### 1. 通用文件列表可绕过 HR 保护投影与 required audit（P0）

`FilesService.listForActor` 仅在调用方显式传入受保护 `biz_type` 时执行 `assertReferenceAccess`。当 `biz_type` 为空时，查询条件只是排除 property file types，仍会返回 HR 的 `hr_employee_document`、`hr_employee_photo`、`hr_employee_credential_evidence`、`hr_contract_document` 等记录。该分支返回原始 `FileEntity`，不会进入 HR projection，也不会写 HR required audit。

影响：持有通用文件列表权限的账号可能枚举跨员工/跨管理树 HR 文件 metadata，并取得 `storagePath/storedName/hash/remark/createBy` 等内部字段；这也绕过了证照/合同文件的独立 domain permission。必须在查询前 fail closed：未指定 biz_type 的通用列表排除所有 protected biz types，或对每个结果逐对象授权（不建议，分页总数也会泄漏）。分页 `total` 同样属于泄漏，不能只过滤返回 items。

### 2. 合同薪资读取审计字段分类不足（P0）

`contractDetail` 在 park scope 且具 `HR_COMPENSATION_READ` 时返回 `probationSalary/baseSalary`，但 audit 固定只记录 `fieldGroups:["employment_contract"]`。因此审计无法证明读取了 compensation/financial 数据，也无法按薪酬访问做告警和复核。必须根据 `canReadSalary` 动态追加 `financial/compensation`，并用测试断言无薪资权限时字段与审计分类同时不存在。

### 3. 保险 team 金额语义未签署（产品阻断）

manager/team 当前可获得每名员工的 `employeeAmount/supplementAmount` 汇总。代码有 data scope 和 required audit，但旧系统/需求证据尚不能证明部门经理应读取个人社保金额。保持现状前必须由 HR/合规签署；否则 team projection 应只给状态/月份/needsReview，金额需独立 `HR_INSURANCE_AMOUNT_READ` 原子权限。禁止用 `HR_INSURANCE_TEAM_READ` 名称推断金额授权。

### 4. 下载错误面尚无端到端证明（P0 测试缺口）

下载目前 audit 在 header/stream 前，属于正确设计；但 `prepareDownload` 已解析 absolute path，`createReadStream` 的打开错误可能发生在响应开始之后。必须证明：authorization/audit 失败时 403/404/5xx 响应不含文件 Content-Type、Content-Length、Content-Disposition，不创建 stream、不记录 success audit；文件缺失/截断时不把成功下载审计当作完整交付。建议把“授权访问审计”和“传输完成/失败”分开记录，避免成功语义虚标。

## Seed/RBAC 门禁

1. `HR_MANAGER` 可有 `FILE_DOWNLOAD`，但必须同时通过 domain permission + reference scope；通用 FILE_READ 绝不能绕过 HR domain。
2. `DEPARTMENT_MANAGER` 不应获得 payroll run/detail、contract salary、credential document read，除非独立原子权限显式授予；seed upgrade 必须删除旧宽权限，不仅追加新权限。
3. `EMPLOYEE_SELF_SERVICE` 只允许 confirmed self payslip、self contract projection、self insurance projection以及明确关联本人的文件；直接 UUID 他人对象统一 safe not-found/forbidden且无 metadata/header。
4. 生产 seed 需要 SQL gate 验证三角色 exact permission set，角色升级后旧 `file:read`/宽 HR 权限不能产生 protected file 列表旁路。

## 必须新增的自动化门禁

### Unit/contract

- 无 `biz_type` 文件列表不能返回任何 protected HR file，且 `total=0/只统计允许对象`；负例覆盖每个 HR biz type。
- contract salary 有/无 `HR_COMPENSATION_READ` 的 body 和 audit fieldGroups 成对断言。
- 所有 required audit mock 抛错时 promise reject，controller 不包装成功 body。
- header 测试断言 authorization/audit/storage-open 失败均无三类文件 header、无 stream call。

### 真实 PostgreSQL

- HR/manager/employee 三角色，两个 park、兄弟组织、软删 employee、直接 UUID；逐路由验证 body、total、projection 与 required audit row。
- payroll self 只读 confirmed+本人；HR payroll detail 可读；manager 全部拒绝。history items 第二次 audit 失败零 body。
- insurance park/team/self 精确字段矩阵；产品决定前将 team 金额测试标为阻断而不是猜测通过。
- protected files 同时验证 file tenant/park、biz reference tenant/park、employee/contract管理树三者一致；伪造 biz_id/file UUID组合拒绝。
- required audit 表不可写、事务超时、唯一/连接失败时，所有敏感读取 fail closed。

### HTTP/stream

- 用真实文件和不存在文件执行 download：记录 response headers/body byte count、stream error、audit access/complete/failure；拒绝路径零字节。
- 文件名含引号、CR/LF、Unicode 时 Content-Disposition 无 header injection；日志不得出现绝对路径、工资、证件号、storage hash 或原始 source snapshot。

## 放行条件

修复通用文件列表旁路、补全合同薪资审计分类、签署保险 team 金额策略，并使三角色真实 PG + HTTP stream/header 负例全部通过后，P0-5 方可从 NO-GO 改为 GO。现有静态/单元成功不足以替代这些运行时证据。
