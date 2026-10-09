# 360 configuration context

## 1. Scope / Trigger
Model managers need complete saved model/questionnaire configurations without employee or evaluation authority. Managers configure actual dimensions/anchors/questions, save explicit drafts, publish separately and continue immutable versions.

## 2. Signatures
GET /hr/feedback360-v2/configuration -> {models,questionnaires}. Web: hrApi.feedback360Configuration(token?,signal?) with HrFeedback360Configuration types.

## 3. Contracts
READ or MODEL_MANAGE, matching principal tenant/park before SQL. One REPEATABLE READ transaction returns every version of each undeleted scoped root, preserving currentVersionNo, versionNo/name/status/ID. Models include scaleMin/Max as decimal strings, ordered dimensions with description/null, weight precision4, ordered anchors level precision2/text. Questionnaires include exact modelVersionId/name/versionName and ordered code/dimensionCode/text/type/required. Nested joins carry full scope and question dimensions match the bound model version. No employee, subject, response or result reads. Existing required HR read audit records only fieldGroups/projection/itemCount, never configuration body.

## 4. Validation & Error Matrix
Missing exact authority or actor scope mismatch ->403 before transaction/audit, including foreign super principal. Query failure -> no partial result or successful audit. Required audit failure -> propagated. Append routes require exact MODEL_MANAGE and matching actor scope. POST models/:id/versions and questionnaires/:id/versions require expectedVersionId and inherited nested DTO validation; IdempotencyInterceptor provides replay/conflict semantics. Parent FOR UPDATE precedes pointer read and version publication lock; stale pointer, retired root, changed identity or noncurrent publication ->409. New drafts append children and advance a monotonic scoped pointer.

## 5. Good/Base/Bad Cases
Good: model-only manager recovers published and draft versions without CYCLE_MANAGE. Base: foreign parks remain separate even when model codes match. Bad: derive configuration from employee-bearing options, which also hides models without CYCLE_MANAGE, or query parent and children from inconsistent snapshots.

## 6. Tests Required
Unit tests exercise actual service permissions, REPEATABLE READ selection, read failure, audit failure and metadata-only audit. HR_FEEDBACK_CONFIGURATION_PG_REQUIRED=1 uses only127.0.0.1:15486, random owned DB and unmodified actual000260 with identity-only prerequisite stubs; real create/publish/read tests verify decimal precision, description, anchors, question type/required, park isolation, all-version ordering despite unchanged current pointer, and immutable published fields. Apply forward-only000346 and verify concurrent same-base append has exactly one winner, current draft publication, rejection of pointer regression/nonexistent version/identity rename and preservation of old questions/cycle snapshots. Drop DB and owned container. This lab proves configuration projection/domain guards, not full bootstrap, anonymous-result business acceptance or production UAT.

## 7. Wrong vs Correct
Wrong: create a model and immediately publish fixed sample dimensions, or update000260 to permit published root changes. Correct: separate configuration from publication; forward-only000346 allows only current version pointer/update metadata and controlled publication transitions. Existing version/child/cycle/response/result guards remain unchanged. Append validates expectedVersionId under parent lock. Full Web configuration independently loads model/questionnaire context, renders shared Design, uses stable rows and actual published model dimensions, preserves failed input and separates committed saves from refresh failures. Context changes abort prior reads and discard drafts.
