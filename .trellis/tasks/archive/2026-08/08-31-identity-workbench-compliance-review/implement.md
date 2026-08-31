# Investigation Plan

## Phase 1 — Establish Evidence

- [x] 精读设计任务 PRD/design/implement 及其研究/验收材料，生成 `IDY-*` 草案。
- [x] 并行检索 Web、API/持久化、权限、民宿/住房消费链、使用说明。
- [x] 检索大陆官方公开法律和住宿治安登记依据，记录标题、发布机关、URL 与适用边界。
- [x] 主代理按探子返回的 `file:line` 抽查关键证据，并亲读最终引用的关键实现片段。

## Phase 2 — Synthesize Report

- [x] 写设计要求矩阵与实现状态。
- [x] 写使用说明存在性/一致性核查。
- [x] 写大陆运营场景评估，逐项列当前实现、缺口、建议及产品/法务确认标记。
- [x] 写 P0/P1/P2 问题、改动面、迁移、验证方式、决策点和免责声明。
- [x] 校验统计、交叉引用、敏感信息与“事实/推断”标签。

## Phase 3 — Verification and Delivery

- [x] 运行 `git diff --check`、Markdown 链接/路径抽查、敏感信息模式扫描和范围检查。
- [x] 使用 Trellis check/独立探子做一轮报告 review，并修正经复核成立的问题。
- [ ] 提交任务材料与报告；确认无产品代码差异。
- [ ] 推送报告分支，创建 PR，等待 CI，完成一次 review 后合并。
- [ ] 等待并确认 main 分支所需检查双绿。
- [ ] 按 Trellis 收尾流程归档调查任务并给出终报。

## Validation Commands

```bash
git diff --check
git status --short
git diff --name-only origin/main...HEAD
rg -n "[1-9][0-9]{16}[0-9Xx]" docs/reviews .trellis/tasks/08-31-identity-workbench-compliance-review
gh pr checks <PR>
gh run list --branch main --limit 10
```

敏感信息扫描只作为误入报告的防线，不以命中模式自动断言真实证件信息；任何命中需人工复核。

## Risk and Rollback Points

- 法规解释过度：仅引用官方公开来源，工程结论加限定，法律结论交法务。
- 静态检索漏项：跨目录并行检索、关键路径主代理抽查、独立 review。
- 当前 main 漂移：报告固定记录审计 commit；PR 前 rebase/merge 仅在无冲突且不改写证据时进行。
- 外部 CI/Review 阻断：持续等待并保留真实状态，不伪造通过结论。
