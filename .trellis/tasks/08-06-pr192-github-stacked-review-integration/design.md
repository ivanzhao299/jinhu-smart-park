# PR192 GitHub 主干集成设计

## 1. 决策摘要

弃用“多个 stacked PR + 一个 final PR”。采用：

```text
immutable snapshot / optional compare refs
                    |
latest origin/main --merge--> dedicated integration worktree
                    |
              one Draft PR to main
                    |
       CI + release smoke + final-SHA formal gates
                    |
                  Ready
```

原因：当前 main 无可见保护，stacked PR 会重复 CI、可能误合并；Track B 历史包含大量
Trellis 归档噪音；retarget base 会改变 diff/review；cherry-pick/rebase 会破坏 commit-bound
证据身份。

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

### 2.2 Integration branch

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
local preflight
  -> push integration
  -> Draft PR
  -> verify
  -> run-release-smoke
  -> rollback/performance formal gates
  -> independent reviews
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
