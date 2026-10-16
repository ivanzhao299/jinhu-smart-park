# Frozen API / Web handoff contract

2026-10-16. Backend/shared writer remains original implementer; root is dispatching a disjoint Web writer. No Web changes by backend writer after this handoff. Existing uncommitted Web startup changes must be continued. All paths below are relative to `/hr/performance-v2`. Existing old dimension payloads/routes stay compatible; five-channel bodies do not contain dimensionScores or caller-supplied mode.

## Shared exports

`HrPerformanceWorkflowPolicy`, `HrPerformanceMasterPolicy`, `HrPerformanceChannelInput`, `HrPerformanceInputCell`, `HrPerformanceInputChange`, `HrPerformanceInputField`, channel/master/adjustment key constants, `emptyHrPerformanceWorkflowPolicy`, `validateHrPerformanceWorkflowPolicy`, `validateHrPerformanceInputChanges`, `performanceInputPolicy`. A projection type with optional masked cells will be added to shared; stored full input contract stays unchanged.

Policy `{schemaVersion:1,detailDefinitions:[{id,itemId}],masterPolicies:{selfAppraisal,appraisal,description,salaryReference},appealReviewAllowed:{s,m,t,x,c,master,timekeep,bonus,selfAppraisal,appraisal,description,salaryReference}}`. Each master policy `{stage:self_review|manager_review|calibration|null,allowedActors:[self|manager|calibrator],required:boolean|null,allowExplicitNull:boolean|null}`. Appeal choices boolean|null. Draft NULL permitted; publish requires complete choices. Independent detail IDs are exact/nonempty128; same item may have many details. Never infer roles from channel letters. All mathematical fields in current stage must be provided before submit; required=true requires VALUE, required=false allows explicitNULL only with configured policy and evidence. Future-stage fields are not required now. Optional texts do not gate math completeness.

## Template definition / workflow

Existing channel create/version DTO unchanged in required properties. Version response and list/detail now additionally expose `workflowRevisionId:string|null`, `channelWorkflow:HrPerformanceWorkflowPolicy|null`. Published channel detail is valid; do not retain the old draft-only decoder/UI limitation.

`POST template-versions/:id/channel-workflow/revisions` body `{expectedDefinitionRevisionId:uuid,expectedWorkflowRevisionId:uuid|null,policy}`. Response `{id:versionId,versionId,definitionRevisionId,workflowRevisionId,revisionNo,status:'draft'}`. TEMPLATE_MANAGE + idempotency + captureBody:false audit. Current-draft dual-CAS only.

`GET template-versions/:id/channel-workflow/history?page=1&pageSize=10` response `{versionId,currentRevisionId:workflowRevisionId|null,items:[{id,revisionNo,definitionRevisionId,policy,createdBy,createdAt,previousRevisionId}],total,page,pageSize}`. TEMPLATE_READ/MANAGE; complete retained pages. Backend adds this route.

Existing config append body must additionally include `{expectedWorkflowRevisionId,workflowPolicy}` whenever this draft already has a workflow pointer. Both definitions advance atomically; omitted/stale workflow is409. Existing config schema1 stays exact. Current version publish endpoint accepts no body change; complete policies and exact actual DB pure-function EXECUTE are checked. Published version freezes both revision IDs. New-version UI should send optional workflowPolicy to carry the edited policy forward; backend will accept it on the existing channel create/version DTO and bind it in the same transaction. Published current config cannot be revised; create a new version instead.

## Review current / patch / history / preview

`GET reviews/:id/channel-input` returns:
`{id,status,calculationMode:'five_channel_v1',currentRevisionId,revisionNo,input,allowedFields:[{detailId:string|null,field}],template:{channelDefinition,channelWorkflow,...frozenTemplateMetadata},salaryReferenceAvailable:boolean,preview:null|{schemaVersion:1,mathVersion:'five_channel_v1',inputRevisionId,complete:boolean,score:string|null,grade:{status,expectedGrade,winningMinValue,winningCandidateCount},gradeCandidate:fullCandidate|null,levelCode:string|null,levelName:string|null}}`.

Stored input `{schemaVersion:1,details:[{id,itemId,channels:{s,m,t,x,c}}],adjustments:{master,timekeep,bonus},master:{selfAppraisal,appraisal,description,salaryReference}}`. Cell `{state:'UNPROVIDED'|'EXPLICIT_NULL'|'VALUE',value:string|null,actorUserId:uuid|null,changedAt:ISO|null,evidence:string|null}`. Initial UNPROVIDED has all other fieldsNULL. Missing projected cell means unavailable/masked, never UNPROVIDED. Salary cell is omitted unless park PERFORMANCE_READ plus PAYROLL_DETAIL_READ. Employee prefinal projection also omits nonself fields to preserve old result visibility. Never manufacture data from omitted cells.

`PATCH reviews/:id/channel-input` body `{expectedRevisionId:uuid,changes:[{detailId:string|null,field,state:'VALUE'|'EXPLICIT_NULL',value:string|null,evidence:string}]}`. Complete explicit fields in each change, no extra keys; no UNPROVIDED reset; no change entries for untouched or unreadable fields. Decimal18,2 plain strings; salary19,4 plain string; texts500 preserve empty/NULL when policy permits. Evidence2..1000 and nonblank. Response `{id,currentRevisionId,revisionNo,status}`. Only allowedFields are writable; stage/relation/current actual permissions rechecked. All patches have existing permissions + idempotency + no-body audit.

`GET reviews/:id/channel-input/history?page=1&pageSize=10` returns `{reviewId,currentRevisionId,items:[{id,revisionNo,previousRevisionId,input,createdBy,createdAt}],total,page,pageSize,salaryReferenceAvailable}`. Same scoped visibility and masked projection at every revision.

`POST score-preview` channel body `{reviewId,inputRevisionId}` only. Response is the preview above, current exact revision required. Existing dimension body `{templateVersionId,dimensionScores}` remains.

## Existing operations dispatched by stored mode

Self/manager existing routes body `{inputRevisionId}` only; response `{id,status:'manager_review'|'calibration',score:string|null,inputRevisionId}`. Incomplete future-stage input gives scoreNULL; do not coerce it to string'null' or0.

Calibration existing entries route body `{cycleEmployeeId,inputRevisionId,reason}`; response `{id,beforeScore:string|null,afterScore:string,inputRevisionId}`. Complete inputs and unique grade required. Nullable beforeScore is intentional when manager had no final total.

`POST calibration-batches/:id/complete` channel body `{reviewIds:uuid[]}` unique1..100. Response `{id,status:'active'|'completed',pending:number,employeeCount:number,items:[{id,status:'employee_acknowledged'|'appealed'|'confirmed',inputRevisionId?,result?,alreadyFinalized?}|{id,status:'failed',errorCode:number,message:string}]}`. Each review is its own transaction; one incomplete review does not rollback others. While any calibration employee remains, batch stays existing active. Retry with same idempotency key returns same receipt; fresh selection retry does not re-finalize already finalized reviews. Existing dimension completion accepts no body and returns its original receipt.

Acknowledge/appeal unchanged paths/body. Upheld appeal resolution body `{decision:'upheld',reason,inputRevisionId}`; rejected body `{decision:'rejected',reason}` with no input revision. In appealed stage, input PATCH permits only explicit workflowPolicy.appealReviewAllowed fields, nonself actual APPEAL_REVIEW actor, salary intersections still apply. Recompute can preserve numeric score while changing revision/evidence. Rejected appeal preserves previous final revision exactly.

Existing review-list/page rows add `calculationMode`, `currentInputRevisionId`, `predecessorReviewId`. Result adds full `gradeCandidate` and `inputRevisionId`; five-channel levelName is short grade code, description500 is in gradeCandidate.description, never truncated. Input history carries master narrative text and amounts only after projection. Review/actions/exports never embed salary amount/documents.

## Confirmed correction

`GET cycles/corrections/options?page=1&pageSize=30` (backend adds) under PERFORMANCE_MANAGE returns `{items:[{reviewId,employeeId,employeeCode,employeeName,cycleId,cycleName,businessStartDate,businessEndDate}],total,page,pageSize}`. Confirmed scoped predecessors only, all pages reachable.

`POST cycles/corrections` body `{cycleCode,cycleName,startDate,endDate,templateVersionId,predecessorReviewIds:uuid[],selectedEmployeeIds:uuid[],correctionReason,businessPeriodRef}`. Two lists unique and match exactly; one predecessor per selected employee. Dates/business reference explicit, never inferred from source recorded_at. Response `{id,status:'planning',selectedEmployeeCount}`. Existing cycle publish then creates only explicitly selected employees, each carrying predecessorReviewId; old confirmed rows/actions untouched. No production/test record creation by UI preview.

## Frontend ownership / acceptance

Web writer owns all apps/web paths, interaction tests and Web spec/index. Existing startup files: PerformanceChannelWorkflowPolicyEditor, hr-api additions, definition editor paired-save/published decode, PerformanceTemplates policy branch. Their startup changes are not yet validated; continue/refine rather than overwrite with old versions. Backend writer owns shared/API/372/PG/backend spec/testing docs. Interface changes after this freeze must be messaged before changes.

Keep existing workspace synchronous lock/captured token/body/key and definite-vs-uncertain retry classification. Receipt checks must accept nullable score/beforeScore and partial batch active receipts. Complete arrays, precise strings, policy/input/history pagination, late response/identity protection, meaningful native-looking DS/mobile44px controls. Root owns final native desktop390px and release after independent review.

Employee-self without RESULT_READ before employee_acknowledged/appealed/confirmed: current.preview is exactlyNULL, never a fake incomplete result. Independent score-preview rejects this hidden-result scenario403; history masks nonself cells. Web must render nullable preview as not yet visible, not0.
