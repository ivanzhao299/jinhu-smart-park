# 360 configuration context

## 1. Scope / Trigger
Model managers need complete saved model/questionnaire configurations without employee or evaluation authority. This is a prerequisite for the full editable configuration workflow, not completion of that workflow.

## 2. Signatures
GET /hr/feedback360-v2/configuration -> {models,questionnaires}. Web: hrApi.feedback360Configuration(token?,signal?) with HrFeedback360Configuration types.

## 3. Contracts
READ or MODEL_MANAGE, matching principal tenant/park before SQL. One REPEATABLE READ transaction returns every version of each undeleted scoped root, preserving currentVersionNo, versionNo/name/status/ID. Models include scaleMin/Max as decimal strings, ordered dimensions with description/null, weight precision4, ordered anchors level precision2/text. Questionnaires include exact modelVersionId/name/versionName and ordered code/dimensionCode/text/type/required. Nested joins carry full scope and question dimensions match the bound model version. No employee, subject, response or result reads. Existing required HR read audit records only fieldGroups/projection/itemCount, never configuration body.

## 4. Validation & Error Matrix
Missing exact authority or actor scope mismatch ->403 before transaction/audit, including foreign super principal. Query failure -> no partial result or successful audit. Required audit failure -> propagated. No domain mutations.

## 5. Good/Base/Bad Cases
Good: model-only manager recovers published and draft versions without CYCLE_MANAGE. Base: foreign parks remain separate even when model codes match. Bad: derive configuration from employee-bearing options, which also hides models without CYCLE_MANAGE, or query parent and children from inconsistent snapshots.

## 6. Tests Required
Unit tests exercise actual service permissions, REPEATABLE READ selection, read failure, audit failure and metadata-only audit. HR_FEEDBACK_CONFIGURATION_PG_REQUIRED=1 uses only127.0.0.1:15486, random owned DB and unmodified actual000260 with identity-only prerequisite stubs; real create/publish/read tests verify decimal precision, description, anchors, question type/required, park isolation, all-version ordering despite unchanged current pointer, and immutable published fields. Drop DB and owned container. This lab proves configuration projection/domain guards, not full bootstrap, anonymous-result business acceptance or production UAT.

## 7. Wrong vs Correct
Wrong: create a model and immediately publish fixed sample dimensions, or update000260 to permit published root changes. Correct: separate configuration from publication; for subsequent editable/version workflow add a reviewed forward-only migration and optimistic parent lock while preserving all old versions/cycle snapshots. Current000260 freezes entire published root and version identity, so merely adding an append API cannot advance its root pointer.
