# PR192 GitHub 主干集成设计

## 1. 决策摘要

采用“只读审查投影栈 + 一个 final integration PR”：

```text
immutable cutpoints -> sanitized review root
                    -> Track A review PR (Draft, forbidden to merge)
                    -> Track B review PR (Draft, forbidden to merge)
                    -> Track C review PR (Draft, forbidden to merge)

latest origin/main --merge--> dedicated integration worktree
                    -> PR #223 to main (the only merge source)
                    -> review summaries + CI + release smoke + final gates
```

审查投影不改写或替代 canonical history，只把 immutable cutpoint 之间的非 `.trellis` 代码
差异投影为小型 Draft PR。这样既避免 Track B 的海量 Trellis 归档噪音进入 Codex 上下文，
也不把投影分支作为生产合并源。PR #223 保持 canonical history 与 final tree，仅汇总各层
结论并承担 main 冲突、跨层 Gate 和 CI。

## 2. Branch Contract

### 2.1 Immutable refs

- `codex/pr192-reviewed-snapshot` -> `f19ab4d5`。
- `codex/pr192-coordination` -> 任务计划/start 提交；该提交第一父链包含 `f19ab4d5`，
  且相对 `f19ab4d5` 只能新增本任务 `.trellis/tasks/08-06-.../**`。
- 可选 compare refs：
  - `codex/pr192-compare-a` -> `0152616f`。
  - `codex/pr192-compare-b` -> `f4797adfdcca686a124f8ff438b58e8ba65441f1`
    （B code/reconcile gate；避免以纯归档
    `bc1e41a4` 作为代码边界）。
  - `codex/pr192-compare-c-core` -> `ff75742d`。
  - `codex/pr192-compare-c-final` -> `15b6e8f6`。
- compare refs 不开 PR、不作为 merge source，只用于 GitHub compare、本地 diff 和审查分派。
- 所有 refs 只能首次创建或 fast-forward 到完全相同目标；禁止 force push。

### 2.2 Read-only review projections

- `codex/pr192-review-root` -> 原 merge-base，仅作为投影栈 base，不开 PR。
- `codex/pr192-review-a`：投影 merge-base 到 Track A cutpoint 的非 `.trellis` 差异。
- `codex/pr192-review-b`：基于 review-a，投影 Track A 到 Track B cutpoint 的非 `.trellis` 差异。
- `codex/pr192-review-c`：基于 review-b，投影 Track B 到 Track C final cutpoint 的非 `.trellis` 差异。
- 如 final integration repair 仍过大，可增加 `codex/pr192-review-integration`，只投影
  Track C final 到 PR #223 HEAD 的 PR192 集成/冲突修复；不得混入 PR224–226 或 Android 平行工作。
- 投影提交必须写明 source range、排除规则和 canonical PR；所有 PR 保持 Draft、禁止合并、
  禁止 auto-merge，审查结论回填 PR #223。

### 2.3 Integration branch

- 名称：`codex/pr192-main-integration`。
- Base：执行时 `origin/main` 的精确 SHA，记录到任务 metadata/research。
- 在专用 worktree 中执行：

```text
git merge --no-ff --no-commit <coordination-sha>
```

- 逐文件解决冲突后形成一个可审计 merge commit。
- 不合并旧 `fix/uat-*` tips；缺口以新的窄提交修复。

## 3. Conflict Adjudication

每个冲突记录：

- path；
- main side SHA/intent；
- snapshot side SHA/intent；
- 选择或组合规则；
- targeted tests；
- reviewer。

原则：

- 安全、身份、文件授权、财务、迁移语义不能靠“ours/theirs”批量覆盖。
- Trellis journal 冲突按 session 记录合并，不删除任一真实历史。
- 已删除但 main 修改的测试必须根据当前产品表面决定保留、迁移或由新行为测试替代。
- 任何共享 contract 变化同时核对 API/Web consumers。

## 4. Evidence Contract

### 4.1 Inherited evidence

`15b6e8f6` 的 evidence 保留原样，用于证明 snapshot 本身通过，不随集成 HEAD 漂移。
集成中必须运行：

```text
git merge-base --is-ancestor 15b6e8f6 <integration-head>
```

并生成 `15b6e8f6..<integration-head>` 的 performance/rollback closure diff。

### 4.2 Final evidence

因为最终 merge 会引入 main-side 文件与冲突裁决，新 HEAD 需要重新生成：

- rollback 19/19；
- formal performance 30-cell；
- independent evidence review；
- independent cleanup review。

在 fresh formal evidence 完成前，PR body 只能写“snapshot evidence inherited as
ancestor-only”，不得写“integration SHA performance PASS”。

## 5. CI / PR State Machine

```text
archive pruning + retention manifest
  -> push integration and refresh PR #223 CI
  -> push read-only review projection stack
  -> request Codex on each bounded projection
  -> summarize reviews in PR #223
  -> verify + release-smoke + rollback confirmation
  -> confirm PR head unchanged
  -> Ready for review
```

如果 PR head 在任一 Gate 后变化：

- 普通 docs-only 变化：重跑 verify，并做 evidence closure 分类；
- code/config/test/env/seed/perf/rollback 变化：对应正式 Gate 失效并重跑；
- 无法证明无关时按相关变化处理。

## 6. Rollback

- 推送前保留 snapshot 与 coordination refs，集成失败不改写任一 ref。
- 集成 worktree 可删除重建；不 reset 当前用户工作树。
- 未 merge 的 GitHub PR 可关闭，远端 integration branch 保留到审计完成。
- 禁止对共享远端分支 force push。
