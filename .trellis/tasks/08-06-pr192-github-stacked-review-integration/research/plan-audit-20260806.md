# 分层审查方案复核（2026-08-06）

## 发现并修正的问题

1. **多个 stacked PR 不安全**：main 无可见 protection，draft/标题不能替代仓库规则；
   retarget 会改变 diff/review，多个 PR 还会重复触发 CI。
2. **Track B diff 噪音过大**：线性区间含大量 Trellis archive 历史，不适合作为独立
   GitHub merge PR。
3. **证据绑定错误**：formal evidence 顶层 `commitSha=15b6e8f6...`；gate 只检查 SHA
   格式，不比较当前 HEAD。rebase/cherry-pick/squash 会直接破坏 identity；merge 也只能
   保留 ancestor-only 结论。
4. **平行分支重复风险**：agent/fix 与 refix 聚合分支已经是 origin/main 祖先；单项
   UAT branches 不能按列表再次合入。
5. **当前工作树不可用于集成**：存在用户既有 `.codex/config.toml` 与 `NUL`，必须使用
   独立 worktree。

## 权威切点

| 作用 | SHA |
|---|---|
| merge-base / review base | `696873aa854ef2eed0bc6ab8edfa4043917bdb29` |
| Track A closure | `0152616fb9a25effdff68fa9da24fea7db8a21a7` |
| Track B code/reconcile gate | `f4797adf` |
| Track C core/canonical port | `ff75742d949a83959bcdebd76197287344c27b18` |
| final technical code | `15b6e8f6edd12759dc35b1675f851c9a0bc52c0c` |
| reviewed snapshot/docs | `f19ab4d509595579d40d2906628df409cdfd92aa` |
| initial latest origin/main | `3608608ad1cb9c1b53c1829f8cd0f9fb33b6f098` |

## 修正结论

推送 immutable refs 可以保留审查切面，但不创建 stacked PR。唯一可合并对象是从最新
main 建立的 integration branch。任务计划/start 先形成只含本任务目录的 coordination SHA，
integration merge 该 SHA。它必须保留 snapshot ancestry、逐文件解决冲突，并在最终
SHA 上重新取得 CI、release-smoke、rollback 与 30-cell performance 证据。
