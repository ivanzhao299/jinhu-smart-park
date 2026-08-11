# PR192 immutable ref manifest（2026-08-06）

## Integration base

- `origin/main`: `3608608ad1cb9c1b53c1829f8cd0f9fb33b6f098`
- integration worktree: `/home/jinhuit/JinHuCodebase/jinhu-smart-park-pr192-integration`
- integration branch: `codex/pr192-main-integration`

## Published read-only refs

| Ref | Commit |
|---|---|
| `codex/pr192-reviewed-snapshot` | `f19ab4d509595579d40d2906628df409cdfd92aa` |
| `codex/pr192-coordination` | `cd3e6a1a9f4376a7a1f13651e23e6dbf66ddbb2e` |
| `codex/pr192-compare-a` | `0152616fb9a25effdff68fa9da24fea7db8a21a7` |
| `codex/pr192-compare-b` | `f4797adfdcca686a124f8ff438b58e8ba65441f1` |
| `codex/pr192-compare-c-core` | `ff75742d949a83959bcdebd76197287344c27b18` |
| `codex/pr192-compare-c-final` | `15b6e8f6edd12759dc35b1675f851c9a0bc52c0c` |

创建前两次核验远端均不存在同名 heads；随后使用一次 `git push --atomic` 创建全部
六个 refs，没有使用 force。推送后 `git ls-remote --heads` 返回的 SHA 与上表一致。

按 refname 排序的 CSV manifest SHA-256：
`f590d4616378b8f1582bff0bb045c06545e76a5c1953743543edb2359ca09456`。

`f19ab4d5` 与 `15b6e8f6` 均为 coordination SHA 的祖先；`f19ab4d5..cd3e6a1a`
只新增本任务目录内 7 个 Trellis 文件。
