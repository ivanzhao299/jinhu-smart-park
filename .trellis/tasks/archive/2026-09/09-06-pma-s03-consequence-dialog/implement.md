# Implementation Progress

## Plan

- [x] 创建 Issue #664、分支与 Trellis 任务。
- [x] 核验共享 `ConsequenceDialog` 已存在，避免重复提取。
- [x] 接入民宿入住/退房。
- [x] 接入 leasing 结算确认与退租生效，并移除对应 prompt/confirm。
- [x] 补定向采用契约与手机宽度/触控样式契约。
- [x] 本地验证、review 3 轮、PR CI、merge、main 双绿。
- [x] Trellis 归档与 closure PR #666。

## Evidence Log

- 2026-09-06：从 `origin/main@63181ac2` 创建 `codex/fix-pma-s03`；Issue #664。
- 2026-09-06：当前 main 已有共享 `features/property-shared/dialog/ConsequenceDialog.tsx`，housing 与 homestay 遗失/未到店已使用；本任务只补审查报告点名主链。
- 2026-09-06：首次 Web typecheck 发现 `CheckoutRow` 无扁平 `contractCode`；改用 `row.contract?.contractCode ?? row.contractId`，未掩盖失败。
- 2026-09-06：定向采用契约 3/3 通过；共享 dialog 约束为 `100vw - 2rem` / `100dvh - 2rem`，既有按钮保持 44px 最小触控尺寸。
- 2026-09-06：`pnpm --filter @jinhu/web typecheck` 与 `pnpm --filter @jinhu/web lint` 通过。静态契约运行有 Node `MODULE_TYPELESS_PACKAGE_JSON` 性能提示，无失败。
- 2026-09-06：当前工具没有可隔离于主 Chrome 的交互浏览器；遵守“不动主 Chrome”，本地仅完成源码、类型、lint 与响应式样式契约，实际桌面/390px 页面检查留给 PR 环境或 L-04 浏览器基线。
- 2026-09-06：review 1 指出 leasing 失败消息仅在 modal 后的页面层不可见；已增加 dialog 内错误透传和重开/关闭清理。review 同时确认 endpoint 保持、单飞 gate 与普通编辑边界；后端真 replay 幂等为既存缺口，非 S-03 范围，留作后续风险记录。
- 2026-09-06：review 2 指出民宿 `mutate` 吞错导致 dialog 误关，以及 leasing API 成功后的刷新失败会被误判为业务失败。已令 mutation 显式返回布尔值并在 dialog 内显示错误；业务提交与后置刷新拆分，刷新失败提示手动刷新但仍关闭确认框，避免重复提交。
- 2026-09-06：review 3 指出民宿提交时 dialog 仍可取消、409 未透传错误，以及 query `load()` 吞错令刷新告警不可达。已绑定 `busy`、统一 409 dialog 错误，并让详情加载显式返回成功布尔值。按审查上限不再开第 4 轮，改以定向测试、类型、lint 与 CI 验证最终补丁。
- 2026-09-06：最终本地验证：property 36/36、homestay 18/18、Web typecheck、Web lint、`git diff --check` 均通过。
- 2026-09-06：PR #665 head `ac32ef02`；CI `34016610818` 成功（Build 15m39s，Release Smoke 因无数据库/发布范围按规则 skipped）；squash merge `74394bf7`。
- 2026-09-06：原 main CI 因后续 main 提交的并发策略被取消；最新 main `fb9f6afc` 明确包含 `74394bf7`，CI `34017477973` 与 Deploy `34017477966` 均 success，作为有效双绿证据。未触碰后续 HR 改动。

## Risks

- `onConfirm` 失败必须返回 false，避免 dialog 错误关闭。
- 生效日期必填，不能因移除 prompt 降低校验。
- 不给普通编辑、预览或退款登记添加确认。
