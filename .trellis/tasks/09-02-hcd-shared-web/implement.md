# Implementation Progress

- [x] 规划 HCD 编号、分层与回滚边界。
- [x] 读取规范和映射/测试模式，建立残留基线（3 路只读探子，已按 file:line 抽查）。
- [x] shared label 与穷尽测试。
- [x] property-shared presentation 基座与纯函数测试。
- [x] 民宿与住房 A/C 类接线。
- [x] HCD 编号测试和定向验证。
- [x] 提交、push、PR、CI、squash merge、main 双绿。

## Validation Log

- PASS `pnpm --filter @jinhu/shared build`
- PASS `pnpm --filter @jinhu/shared exec node --test test/hcd-display-contract.test.cjs`（2/2）
- 首次 Web 测试命令缺仓库既有 CommonJS ts-node 环境，模块解析失败、断言未运行；按 package script 环境重跑 PASS（3/3）。
- Web typecheck 首次发现 `labels[value]` 在 noUncheckedIndexedAccess 下可能为 undefined；已改为显式 fallback，待重跑。
- PASS Web typecheck（shared/Web 基座及第一轮 A/C 接线后）。
- PASS HCD presentation 纯函数测试（3/3）与 A/C source contract（2/2，20 个编号）。
- Web lint 首次发现 2 项：任务页残留未用 import、CJS `__dirname` 不符合 ESLint 环境；均已修复，待重跑。
- PASS Web lint（修正后）。
- PASS shared 全测 35/35、homestay 18/18、housing 30/30。
- property 首次 28/29：既有 source-contract 仍要求页面私有 `SOURCE_TYPE_LABELS`；按新 shared/presentation 单一来源更新为 `propertyLabels.sourceType`，重跑 PASS 29/29。
- Review 1（双路）：修复 asset/source UUID 回退、交割未知类型、任务/采购筛选同源与静态测试弱覆盖；修正后 shared 35、housing 31、property 32 PASS。
- Review 2：发现 PropertyFoundation 冲突 sourceId、审批 requestId、operatorId 三处可见 ID；已改为名称/中文状态占位并补静态门禁，待最终验证。
- PASS Review 2 修正后的 shared 全测 35/35、homestay 18/18、housing 31/31、property 32/32。
- PASS `pnpm lint`。
- PASS `pnpm typecheck`。
- PASS `pnpm build`（API、Web 与 191 个静态页面构建完成）。
- PASS `git diff --check`。
- BLOCKED（环境）`pnpm test`：根脚本进入 S1 smoke 后尝试启动 API，但 `http://127.0.0.1:3001/api/v1` 未在等待窗口内可达；测试断言尚未开始。定向 shared/Web 测试已全部通过，不将该项记为代码通过。
- 两轮独立 review 已完成（上限 3 轮），第二轮问题已由门禁测试覆盖；无需第三轮。
- PR #536 已 squash merge；远端 `main` 为 `422af8fa`。
- PASS PR CI：Detect Release Smoke Scope、Lint/Typecheck/Build、Release Smoke。
- PASS main 双绿：CI success、自动 Deploy Production success（仅监控自动流程，无生产直操作）。

## Risks

PR1 剩余风险：根 S1 smoke 的 API 启动环境未闭环；真实数据、权限裁剪和桌面/390px 运行态将在 PR2/PR3 与最终 UAT 验证。StatusPill、筛选伪值 `open`、工单数字状态、租约 `closed` 漂移、桌面/移动双分支已有静态与单测门禁。
