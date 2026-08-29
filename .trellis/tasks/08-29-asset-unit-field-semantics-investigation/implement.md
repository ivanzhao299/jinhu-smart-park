# 调查执行计划

1. 固化基线：记录分支、`origin/main` SHA、工作树状态及相关 Trellis/spec 指引。
2. 并行探查：
   - 资产单元实体、迁移、DTO/shared、Web 表单与看板字段矩阵；
   - property operation config 状态机、审批/executor/runtime 链；
   - 民宿与长租 picker 过滤、互斥、用途/状态资格条件；
   - Git/PR/Issue/任务文档演进时间线；
   - 全仓用途、出租状态和“住房”文案消费点。
3. 主代理按探查给出的 `file:line`、commit/PR 锚点抽查关键证据，不重做全仓扫描。
4. 形成现状矩阵、演进史、资格链、差距分析、A/B/C 对比、推荐与产品决策清单。
5. 验证零产品代码改动、Markdown 内容、引用路径、Git diff 与敏感信息。
6. 进行一轮独立 review；核验并处理 review 发现。
7. 提交并只 push 报告分支，创建报告 PR，等待 CI；满足条件后用 `gh pr merge` 合并。
8. 验证 main 的合并 commit 与要求的两项绿色 checks，完成 Trellis 收尾；不开实施 Issue。

## 验证命令

- `git diff --check`
- `git diff --name-only origin/main...HEAD`
- 针对报告引用运行 `rg`/`git show`/`gh pr view` 抽查
- 仓库已有 Markdown/link checker 若存在则运行；否则记录未运行原因
- `gh pr checks <pr-number> --watch`
- `gh run list --branch main` 与合并 commit check suite 核验

## 风险与停止点

- 若 Git/PR 证据无法证明原始方案的确切 PR，不推断归属，报告为“未找到可证实的引入 PR”。
- 若发现当前分支或工作树出现他人改动，停止写入并先隔离范围。
- CI/review 仅允许修改调查材料与报告；任何产品修复建议停留在方案层，等待用户批准。
