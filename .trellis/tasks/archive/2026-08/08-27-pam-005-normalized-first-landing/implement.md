# Implementation Plan

1. PAM-004 merge 且 main 双绿后，从最新 `origin/main` 建立 `codex/fix-pam-005-normalized-first-landing`。
2. 读取 PAM-004 最终 helper 与 `post-login-route.ts` 全量相关代码。
3. 统一登录首跳、园区切换、Sidebar、Breadcrumb 的 normalized authorization tree 消费。
4. 补 raw legacy/placeholder、首跳/Sidebar 一致、previous user 场景测试。
5. 运行聚焦测试、Web lint/typecheck/build 和 Trellis check。
6. 提交、push、创建 `Closes #433` PR、`@codex review`（最多 3 轮）、CI 绿后 squash merge，并确认 main CI/Deploy 双绿。
7. UAT 证据链：R2 `20260827-210211` 阻断于 UI fixture；R3 `20260827-220612` 的 enabled landing PASS，但 Park-switch runner 过早判定，selector 仍为 Park A；R4 `20260828-011900` 已实现 `/users/me park_id`、selector value、`switch-context` 2xx 三重等待，但 Park B 产品 API fixture 两次失败，浏览器 Case 未启动；R5 `20260828-095912` 用产品 switch-context 完成 A → B 三重等待，landing `/housing/tasks` 存在于 B Sidebar，Park-switch PASS，六项矩阵 6/6，满足归档门禁。
