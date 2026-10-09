# Performance template editable workflow

## 1. Scope / Trigger
Modern performance template creation/detail/version continuation and business-authorized read isolation.

## 2. Signatures
PerformanceTemplates owns independent template list/detail and publication. PerformanceTemplateEditor accepts validated detail, onSaved/onCancel and a shared synchronous writeLock. Detail decoder projects exact requested template identity and complete configuration. Parent performance workspace keyed by full auth context.

## 3. Contracts
TEMPLATE_MANAGE permits configuring templates without cycle/review READ; TEMPLATE_READ permits complete read-only detail. Never request cycle/review endpoints without their exact read group. Configuration1..30 dimensions and1..20 levels; stable-key add/delete/move retains row ownership. Trim unique codes/names, percentage weights total100 with two decimals -> fraction precision4; score precision2 and full grade coverage0..100 with0.01 adjacent steps. Grade persistence canonical by minimum score. Preserve existing scoringGuide when continuing versions.
Explicit submits retain failed browser drafts. All template writes share synchronous lock; pending save disables parent actions, and finally releases parent busy even when successful refresh replaces/unmounts editor. Parent callback checks its own alive context before state update. New draft version uses original immutable template identity and expectedVersionId.
Detail and list requests abort and ignore stale responses. Editor replacement/close increments generation; successful save refresh cannot reopen another target. Complete user/scope/permissions replacement unmounts all projections and drafts. Committed save/publish refresh errors are separate warnings; no duplicate save after committed-but-unrefreshed editor. Publishing from list is disabled while editing an unsubmitted draft.
Use DS panels/cards/buttons and scoped layout CSS; remove native fieldset frames, keep min44px touch actions. Template and other modern records display on desktop and390px without horizontal overflow. Other performance forms use explicit submit events to preserve failed input; existing approval/score logic unchanged.

## 4. Validation & Error Matrix
Malformed/mismatched detail -> owned error without mounting editor. Weight/code/interval invalid -> visible error before API. Failed create/version -> all fields retained; committed+refresh failure -> success plus refresh warning, no repeat write. No READ -> no fake zero KPIs or unauthorized review reads.

## 5. Good/Base/Bad Cases
Good: reordered enterprise dimensions submitted with exact weights, continued version retains scoring guide, failure then retry produces v2. Base: templates independently available to configuration-only role. Bad: fixed three dimensions, implicit action resets failed form, or parent remains permanently busy after successful editor replacement.

## 6. Tests Required
Actual full page template-only permission, configured ordered payload, failed drafts, version identity/guide, invalid local rules, read-only role, context abort/reset, malformed detail, StrictMode refresh failure, duplicate write and successful editor replacement unlock. Separate desktop/390px actual synthetic browser check; real role/business acceptance remains separate.

## 7. Wrong vs Correct
Wrong: guard parent lock release behind old child's alive ref. Correct: always release shared writer and notify owning parent; parent checks its own alive context.

## 8. 企业评分与审批办理
绩效自评/主管评价不得代填80分。按当前评价冻结的维度scoreMin/scoreMax和两位小数校验；自评只恢复自身已保存分数及评论，主管只恢复主管已保存内容，0分必须保留。校准/采纳申诉可恢复已有最终校准或主管/自评分数。编辑表单以动作种类和评价ID重建，不能携带另一人员草稿。维持申诉原结果不展示或提交dimensionScores；采纳调整才要求完整合法评分。后端继续独立校验范围、主体及状态。
同一现代工作台写动作共享同步锁，提交期间禁用字段、关闭、切换及其他业务动作。写失败保留草稿并在表单附近显示错误；签收等无表单动作也必须有可见错误。成功先清除已提交表单并发布成功，再刷新，读取失败另报，不能把已提交动作重新开放为待保存。完整身份重建/卸载后，旧写操作不得发起旧作用域刷新或发布提示。
领域CSS只负责维度行横跨表单、桌面评分/说明分栏、手机单列和44px按钮。验证0–5/0–100、范围精度、0与既有说明、人员切换、失败重试、申诉两种决定、同步双提交、提交成功读取失败及身份/卸载；保持模板独立工作流回归。实际桌面/390px共享CSS合成API验收与真人岗位验收分别记录。
