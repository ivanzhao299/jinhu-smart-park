# Implementation Plan

1. 创建 GitHub Issue，记录线上复现、根因、矩阵、方案对比和验收标准。
2. 从 `origin/main` 创建 `codex/fix-login-home-landing`，将 Trellis task 绑定该分支。
3. 在 `post-login-route.spec.ts` 先加入“桌面超管 + `/safety/dashboard` 首菜单 → `/dashboard`”回归用例，并确保普通业务岗首菜单覆盖仍存在。
4. 在 `resolvePostLoginPath` 桌面分支加入最小超管首页优先逻辑；移动分支保持原顺序。
5. 运行：
   - post-login route 目标 spec（项目既有 ts-node 命令）
   - `pnpm --filter @jinhu/web typecheck`
   - `pnpm --filter @jinhu/web lint`
6. 使用 Trellis check 流程复核 spec 合规、变更范围、测试有效性与 git diff。
7. 提交并 push 唯一授权分支，创建含 `Closes #<issue>` 的 PR。
8. 发起 `@codex review`；核实每条发现，最多处理三轮同类问题；CI 全绿且无重大问题后 squash merge。
9. 观察 main CI 与 Deploy Production；摘录健康检查和 cleanup 成功日志，确认 Issue 关闭。
10. 本地收尾：主检出 fast-forward、删除已合并本地/远程分支、prune、切到新的 main 跟踪分支；按真实浏览器验收情况更新 Trellis 状态。

## Rollback / Stop Points

- 目标测试、typecheck 或 lint 同一问题连续两次仍失败：停止 push/PR 后续阶段并报告。
- PR review 发现需要扩展到 API/DB 或超出授权文件：停止并回到计划阶段。
- main CI、部署健康检查或 cleanup 失败：不宣称完成，不进行生产直修，保留证据并报告。
