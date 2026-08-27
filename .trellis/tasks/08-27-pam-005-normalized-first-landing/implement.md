# Implementation Plan

1. PAM-004 merge 且 main 双绿后，从最新 `origin/main` 建立 `codex/fix-pam-005-normalized-first-landing`。
2. 读取 PAM-004 最终 helper 与 `post-login-route.ts` 全量相关代码。
3. 统一登录首跳、园区切换、Sidebar、Breadcrumb 的 normalized authorization tree 消费。
4. 补 raw legacy/placeholder、首跳/Sidebar 一致、previous user 场景测试。
5. 运行聚焦测试、Web lint/typecheck/build 和 Trellis check。
6. 提交、push、创建 `Closes #433` PR、`@codex review`（最多 3 轮）、CI 绿后 squash merge，并确认 main CI/Deploy 双绿。
