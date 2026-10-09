# Modern payroll rule maintenance

## Scope and surface

PayrollRuleMaintenance is mounted first in the existing payroll rules work area. It provides rule-set creation, paged set/version selection, project editing, draft revision/save, submission and independent review. The prior formula comparison remains available separately. Modern rule editing does not manufacture legacy scheme identifiers.

## Contracts

RULE_READ controls all probes; PAYROLL_MANAGE controls authoring and FORMULA_REVIEW controls decisions. Auth-context changes remount the workspace and abort old reads. Projects expose explicit accounting roles, direct input versus formula, ordering and an approved salary basis. Editing an approved/rejected version creates a new revision; only drafts are updated. Approval requires explicit month and reason. Author separation and accounting validation remain server-authoritative.

Writes use a synchronous single-flight ref and a retry key bound to the action, set/version/head and payload. Failed writes preserve fields and reuse the same key. Success installs the returned version/status before refreshing, so a refresh failure cannot re-enable the committed operation. Navigation controls are disabled during writes. Read-only operators can inspect all projects.

## Presentation

Use shared ds-panel, primary-button, secondary-button and mobile record classes. Local CSS only controls grid layout, wrapping, touch height and intrinsic widths. Form fields stack at phone widths; pagination and action labels remain horizontal and readable. Do not replace the editor with raw JSON or technical evidence hashes.

## Evidence and remaining gates

Six actual component tests cover authority, read-only project visibility, failed-save retry identity, duplicate flight, committed-refresh failure, explicit approval input and auth-context reset. Existing full payroll/formula component tests remain passing. The actual HrPayrollClient was compiled with clearly labelled synthetic APIs and exercised in the in-app browser at desktop1275 and phone390: edit, failed save, retry, submit, approve, immutable display and responsive cards. This proves local UI behavior, not production roles or real financial equivalence. The complete input/run workflow, real API integration and production business acceptance remain required.

## Payroll result operations

PayrollRunOperations is mounted in the online payroll work area. Batch listing is metadata-only, scoped and paged with PAYROLL_READ. Employee amounts require DETAIL_READ and EMPLOYEE_READ. Backend canReview/canConfirm and local action permissions jointly control UI; server rechecks authority, version, independent operator and frozen totals. Action reasons are explicit, failed requests retain the same identity, and committed refresh failures disable repeats. Money remains exact decimal strings; informational quantities remain four decimals. Expand projects on demand. Global button classes must actually exist: ds-button alone has no base style.

Seven component tests cover scoped probes, exact money/quantity, pagination, retry identity, duplicate confirmation, committed refresh failure, eligibility and context abort. The actual component with synthetic API was checked in the in-app browser at desktop and 390px, including project expansion, review then confirmation. This is local synthetic evidence, not real API or production financial acceptance.

## Employee input preparation

PayrollInputPreparation mounts in the online payroll work area. Authoring requires payroll read/manage, employee/detail and rule-read capabilities before options or employee probes. Periods are open payroll periods; rule sets are paged. Approved effective rule and employee/head versions come from preparation API, not generic employee lists. Candidate and selected employee lists have separate pagination. Search/page changes retain selected exact-decimal inputs; period/rule/auth changes clear them, and effective rule drift clears incompatible projects.

Direct projects start empty, including tax; explicit zero is required. Settlement exceptions need both bounded dates and a meaningful reason; never edit employment dates to manufacture a window. Payloads preserve decimal strings and selected employee versions. Save uses one synchronous flight and payload-bound retry identity, retains failure fields, and disables repeat submission after success. Return to preparation starts a new revision against refreshed authoritative head. This stage creates a draft only; saved revision modification, independent confirmation, formal run creation and correction remain required. Do not publish it as a complete payroll workflow.

Six component tests cover capability/no-probe, cross-page preservation, exact strings/zero, failed save retry identity and pending flight, explicit settlement validation, effective-rule changes and auth-context abort/reset. Actual component was rendered with synthetic API in the in-app browser at desktop and390px; author selected, entered values/dates/reasons, saved and saw committed locked controls. DOM viewport390 and scrollWidth385 demonstrated no horizontal overflow. Real API/role/month acceptance is separate.

## Saved input revisions

PayrollInputOperations mounts after preparation. Payroll-read may inspect only metadata; employee/detail capabilities are checked before amount probes. Server canEdit/canConfirm advisories disclose no author identity. Closed periods, nonlatest drafts and confirmed inputs have no actions; authors cannot confirm their own input. Backend writes still recheck version, roster and authority.

Read-only details are paged20. Explicit edit loads the entire bounded roster in pages100 (maximum2000), verifying identical input/version/status/period/rule/total on each page, exact page cardinality and unique IDs. No editor opens on partial, duplicate or drifting input. Saving submits every employee and exact original employee versions, with names/codes omitted from writes. Employee edits display in independent pages20. Do not save a one-page projection as the entire roster. Preparation elsewhere creates revised rosters; this editor preserves the selected roster.

Writes have one synchronous flight, payload-bound retry identity, retained failure input, installed successful version and terminal-action suppression before refresh. A successful write followed by refresh failure is clearly labelled committed and cannot be repeated. Confirmation is unavailable during local editing. Auth context remounts and aborts private reads. Required scoped backend reads and audits remain server authority.

Six actual component tests prove metadata-only probes, full101-person persistence beyond visible page, version drift rejection, retained failed input/retry identity, confirmation single flight/committed refresh failure and terminal action gating. Existing27 component tests remain passing. In-app actual component synthetic API checked desktop/390px: edit exact values, save complete roster, inspect review advisory, confirm and immutable result. Real roles/month and production remain separate.


### 正式生成与更正工作区（2026-10-09）

正式生成入口绑定已确认输入版本；考勤明确选用当期封账批次；保险须完整分页读取并确认所有员工版本，缺源禁止部分提交。生成使用稳定重试键/同步写锁，成功立即禁重复并刷新结果面板。桌面及390实际整页合成API验收通过，不能替代生产金额角色验收。

## 账套关联操作

新建规则可选择工资账套或显式不关联。候选仅在RULE_READ与MANAGE同时具备时加载，搜索/分页拥有独立状态与取消信号；保留跨页选择和失败草稿，成功清空并刷新候选。规则已关联名称来自规则响应，不以候选页反查。名称正规化、无可读名称使用工资账套编号，重名以业务代码消歧，UUID只用于请求值。候选失败可刷新且不阻止独立规则创建。共享DS网格/按钮及390px检查；不重导历史数据。


## 工资期间关账与关闭期间更正

PayrollModernOperations串联期间操作、员工输入、输入确认、正式计算及结果复核。关账要求至少一批已确认且无待处理批次；关闭期间不重新开放。更正窗口显示业务名称/原批次，刷新后可恢复，选用后固定期间、规则及原批次，只加载窗口输入。更正准备须保留原完整名单，人数使用服务端correctionEmployeeCount而非搜索结果total。普通准备仍按开放期间运行。

MANAGE+DETAIL+EMPLOYEE控制发起更正及未确认批次取消，CONFIRM+DETAIL+EMPLOYEE控制关账和窗口收口；服务端再校验。已确认更正结果可完成窗口，无活动结果时可取消窗口，取消批次保留金额/证据。理由、版本、载荷绑定重试键和同步写锁全部传递；成功先禁重复再刷新，刷新失败标明已提交。期间状态读取失败禁用旧状态动作，只有刷新成功恢复。身份变化中止读取并清空工作区。

实际工作区与共享DS样式以本地合成API检查桌面和390px，无横向溢出；不能替代生产真实角色、实际月份金额及旧系统功能等价验收。
