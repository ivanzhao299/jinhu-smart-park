# Investigation Plan

1. 枚举 Web 路由、页面入口、route-local/shared components 及改名兼容入口。
2. 并行核查 homestay 页面、housing 页面、既有 label 资产、API 契约/返回投影；子代理只做检索与证据压缩。
3. 主代理按返回的 `file:line` 点验关键结论，并补齐跨层对应关系。
4. 建立逐页逐字段 HCD 问题矩阵，统一根因分类并核对统计。
5. 写入 `docs/reviews/homestay-housing-chinese-display-audit-2026-09-02.md`，包含修复架构、后端补字段、D 类定名、改动面与验证矩阵。
6. 运行 Markdown/链接/编号/统计一致性检查，以及 `git diff --name-only` 产品代码零改动检查。
7. 提交并推送报告分支，创建 PR；完成一轮独立 review，对有效意见仅修报告。
8. 等待 CI 全绿后通过 PR 合并；确认 `origin/main` 包含 merge commit 且 main 分支检查双绿。
9. 归档/收尾 Trellis 任务并输出终报。

## Validation

- `git diff --name-only origin/main...HEAD`
- HCD 编号唯一且连续、分类汇总与矩阵一致的本地脚本检查。
- 报告引用文件存在、关键行号抽查。
- PR review 状态和 GitHub checks。
- merge 后 main 对应 commit/checks 状态。

## Rollback Points

- PR 合并前只需关闭 PR/删除远端报告分支；不涉及产品行为回滚。
- 报告若发现证据不足，保留为“待确认”而非推断为缺陷。
