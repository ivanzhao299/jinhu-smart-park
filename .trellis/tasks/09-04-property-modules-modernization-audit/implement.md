# Investigation Plan

- [x] 核验隔离 worktree、基线提交、原 HCD 工作树脏文件清单。
- [x] 建立三模块代码/文档/测试资产地图，定位归档 Trellis 任务与近期战役材料。
- [x] 并行完成设计漂移、API 实现、Web/B 端交互、测试覆盖、HCD UAT 证据审查。
- [x] 主审人抽查关键出处，合并/分级 PMA 发现。
- [x] 形成测试覆盖矩阵和分级统计。
- [x] 编写统一修复方案与用户决策点。
- [x] 生成 `docs/reviews/property-modules-modernization-audit-2026-09-04.md`。
- [x] 验证 Markdown、编号/统计/证据、敏感信息与变更范围。
- [x] 进行一轮独立审查并修订报告。
- [ ] 提交、push 报告分支，创建 PR，等待 CI，通过后合并。
- [ ] 确认合并结果和 main 分支所需检查双绿，归档 Trellis task 并记录会话。

## Validation Commands

- `git diff --check`
- `git status --short`
- 自定义只读脚本/命令核对 PMA 编号唯一性、统计与证据路径存在性
- 相关现有测试仅在不会修改产品文件/外部状态时运行；未运行项必须说明原因
- `gh pr checks <number> --watch`

## Risk And Rollback

- 最大风险是宽范围审查遗漏或误报：以并行取证、准确出处和独立 review 控制。
- 不重复浏览器 UAT；移动端仅引用既有证据，明确证据时效限制。
- 报告分支仅含文档/任务材料；发现越界变更立即停止并还原本审查分支中的越界文件。
