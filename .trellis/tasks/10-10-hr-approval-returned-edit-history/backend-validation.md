# 审批退回修订与轨迹 API 验证

- `HR_APPROVAL_REVISION_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55497 POSTGRES_DB=postgres POSTGRES_USER=postgres POSTGRES_PASSWORD=<synthetic> TS_NODE_TRANSPILE_ONLY=true node --test --test-timeout=120000 --require ts-node/register src/modules/hr/hr-approval-content-history.pg.spec.ts`（在 `apps/api`）：通过，2/2。该隔离测试先执行实际 `000234_hr_approval_workflow.sql`，插入既有 `submit` 动作，再执行实际 `000353_hr_approval_content_revisions.sql`；验证旧动作保留且内容快照为空，裸 `edit` 因缺少 JSON 对象快照被拒绝。还验证 DTO、本人权限、draft/returned 状态、并发同版本仅一个胜出、动作插入失败回滚、SELF+TEAM 并集读取同事、空团队、申请人与对象任一端越出团队、团队读取他人草稿的安全拒绝，以及必需审计失败阻断历史响应。历史投影还注入额外 JSON 键，断言 API 只返回标题、描述和版本。
- `pnpm --filter @jinhu/api typecheck`：通过。
- `pnpm exec eslint src/modules/hr/hr.service.ts src/modules/hr/hr-approval-content-history.pg.spec.ts`（在 `apps/api`）：通过。
- `git diff --check`：通过。
- `000353_hr_approval_content_revisions.sql` 是 forward-only 迁移：添加可空 JSONB 快照，扩展 action 为 `edit`，并只对 `edit` 要求两个非空 JSON 对象快照；未修改历史迁移或写入生产数据。

接口边界：修订只改本人 draft/returned 的标题与 `payload.description` 并保留其他 payload；历史动作的内容快照显式投影为标题、描述和版本，避免 JSON 附加键泄露。审核仍不触发任职、档案或薪资实际业务生效。父任务已在独立 compose 容器完成全量 fresh-schema 迁移、生产安全种子与迁移重放演练；该演练不由本切片替代。
