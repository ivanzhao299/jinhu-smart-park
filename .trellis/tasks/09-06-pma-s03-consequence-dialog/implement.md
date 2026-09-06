# Implementation Progress

## Plan

- [x] 创建 Issue #664、分支与 Trellis 任务。
- [x] 核验共享 `ConsequenceDialog` 已存在，避免重复提取。
- [x] 接入民宿入住/退房。
- [x] 接入 leasing 结算确认与退租生效，并移除对应 prompt/confirm。
- [x] 补定向采用契约与手机宽度/触控样式契约。
- [ ] 本地验证、review ≤3、CI/Smoke、merge、main 双绿、归档。

## Evidence Log

- 2026-09-06：从 `origin/main@63181ac2` 创建 `codex/fix-pma-s03`；Issue #664。
- 2026-09-06：当前 main 已有共享 `features/property-shared/dialog/ConsequenceDialog.tsx`，housing 与 homestay 遗失/未到店已使用；本任务只补审查报告点名主链。
- 2026-09-06：首次 Web typecheck 发现 `CheckoutRow` 无扁平 `contractCode`；改用 `row.contract?.contractCode ?? row.contractId`，未掩盖失败。
- 2026-09-06：定向采用契约 3/3 通过；共享 dialog 约束为 `100vw - 2rem` / `100dvh - 2rem`，既有按钮保持 44px 最小触控尺寸。
- 2026-09-06：`pnpm --filter @jinhu/web typecheck` 与 `pnpm --filter @jinhu/web lint` 通过。静态契约运行有 Node `MODULE_TYPELESS_PACKAGE_JSON` 性能提示，无失败。
- 2026-09-06：当前工具没有可隔离于主 Chrome 的交互浏览器；遵守“不动主 Chrome”，本地仅完成源码、类型、lint 与响应式样式契约，实际桌面/390px 页面检查留给 PR 环境或 L-04 浏览器基线。
- 2026-09-06：review 1 指出 leasing 失败消息仅在 modal 后的页面层不可见；已增加 dialog 内错误透传和重开/关闭清理。review 同时确认 endpoint 保持、单飞 gate 与普通编辑边界；后端真 replay 幂等为既存缺口，非 S-03 范围，留作后续风险记录。
- 2026-09-06：review 2 指出民宿 `mutate` 吞错导致 dialog 误关，以及 leasing API 成功后的刷新失败会被误判为业务失败。已令 mutation 显式返回布尔值并在 dialog 内显示错误；业务提交与后置刷新拆分，刷新失败提示手动刷新但仍关闭确认框，避免重复提交。

## Risks

- `onConfirm` 失败必须返回 false，避免 dialog 错误关闭。
- 生效日期必填，不能因移除 prompt 降低校验。
- 不给普通编辑、预览或退款登记添加确认。
