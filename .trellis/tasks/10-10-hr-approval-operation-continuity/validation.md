# 人事审批负责人入口与办理连续性验证

- `pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-approval-operation-continuity.test.tsx`：通过，9 项测试。
  - 覆盖：self-only 不读取待审、team-only 不读取本人记录、读取分区独立失败、明确 4xx 后保留申请草稿和审核意见、不确定结果的同步互斥及原 body/key 重试、无关成功响应不发布、创建成功后的陈旧/失败读回保留确认记录、审核成功后的陈旧待审读回不重新显示已处理项、上下文切换时旧写不解锁新写、晚读写结果丢弃。
- `pnpm --filter @jinhu/web exec eslint app/hr/approvals/HrApprovalsClient.tsx test/interaction/hr-approval-operation-continuity.test.tsx`：通过。
- `git diff --check`：通过。
- `pnpm --filter @jinhu/web typecheck`：父任务在实现初稿后已通过，记录为 `/Users/mac/.codex/artifacts/hr-approval-operation-continuity-20261010/typecheck-initial.log`。本次审核改动后最终 typecheck、构建及浏览器验证由父任务串行执行，不能把旧的“既有错误”说法作为当前结论。
- 未进行浏览器或生产操作；桌面与 390px 实际页面验收由父任务执行。

实现边界：审批页面只发布申请/审批状态并刷新各自列表；不将审核结果误报为任职、档案或薪资业务已经生效。

## Final parent verification

- Integrated latest main `d9223ab8d96cd2b36bde7c25b3a97f60f6a97cf4`. Preserved both task children and latest attendance publication evidence during two task-document conflict resolutions; API changes merged without conflict.
- Final focused interaction suite: 9/9 PASS. Targeted ESLint PASS. Final Web typecheck PASS. Web build PASS with existing unrelated talent CSS/autoprefixer and canteen lint warnings.
- Parent corrected the test module type import exposed by full typecheck and verified again.
- Actual component compiled with synthetic APIs: desktop and 390px PASS; document clientWidth=scrollWidth=390. Team reviewer completes review; self creation simulates committed write plus interrupted response, then original-request retry yields one record. No production business test writes.
- Browser found shared scene-card icon-column misuse; switched to existing DS record surface and always-visible record grid, then recompiled/rechecked. No global CSS changes.
- Evidence: `/Users/mac/.codex/artifacts/hr-approval-operation-continuity-20261010/`.
- CI/release and actual-role UAT remain separately recorded; local evidence does not establish production business acceptance.

## CI contract synchronization

CI38012211908 exposed two legacy static route assertions requiring the old mobile-only list class and old form/error-loader syntax. Updated them to assert the actual always-visible DS record grid, controlled permission-gated create form, exact self/team/park atoms and independent error sections. Application source did not change. Full `pnpm --filter @jinhu/web test:unit:hr`: 235/235 PASS, zero skipped; targeted route-contract lint and diff check PASS. Existing 9 interaction tests and desktop/390px component evidence remain current because application source/dependencies are unchanged.
