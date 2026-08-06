# 测试反馈缺陷修复实施计划

1. 为 10 个子任务写入可测试 PRD，并登记基线/目标分支。
2. 读取 Web、API、Shared 的相关 Trellis 规范。
3. 从 `696873a` 创建 10 个独立 worktree/分支。
4. 逐子任务激活、实现、运行针对性检查、质量复核并提交。
5. 汇总分支名、提交 SHA、改动文件、验证结果、跳过项和风险。

## Validation Baseline

- Web-only：`pnpm --filter @jinhu/web typecheck`，并运行新增的静态/逻辑回归测试。
- API-only：`pnpm --filter @jinhu/api typecheck`，并运行相关 Node unit test。
- Cross-layer：Web/API 分别类型检查，运行相关 unit test。
- UI 运行环境可用时，用浏览器检查桌面和 390px；不可用时明确说明。
