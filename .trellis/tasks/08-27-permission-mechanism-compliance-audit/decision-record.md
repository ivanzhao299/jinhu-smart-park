# 产品决策与修复终局记录

记录日期：2026-08-27

## 已批准产品决策

1. **Track-B 岗位保持“只进任务台”**：`HOMESTAY_OPERATOR` / `HOUSING_OPERATOR` 不因岗位身份自动获得全部 canonical 业务 surface。维持现有 owner matrix、bundle/template hash 与逐租户 reconcile，不改产品代码。
2. **授权变更保持“刷新后生效”**：当前已登录页面不承诺同 token 下即时推送权限/模块变化；刷新、重登或重新获取 context 后生效。PAM-006 保持产品契约项，不升级为缺陷，不改产品代码。
3. **PAM-001/002/003 终局为核销**：
   - PAM-001：有效模块查询已经闭合 `homestay -> asset` hard dependency，原 P0 候选不成立。
   - PAM-002：write field policy 是明确的 trust-boundary 设计，原 P2 候选不成立。
   - PAM-003：dependency closure 的权威边界在有效模块投影，不要求每个 endpoint metadata 重复声明 dependency，原 P2 候选不成立。

## PAM-004 / PAM-005 交付与归档门禁

- PAM-004：Issue #432、PR #434、squash `087582378e7d603d5ee5f388b312258c29784abf`；review、PR CI、main CI、Deploy 均通过。
- PAM-005：Issue #433、PR #435、squash `d41407b5fe066adf70ca3f4ae5e613999ed44db6`；review、PR CI、main CI、Deploy 均通过。
- PAM-004/PAM-005 已由 R5 `20260828-095912` 以 6/6 PASS 完成复测并归档，详见 `docs/uat/pam-fix5-retest-uat-20260828-095912.md`。
- 父任务 §15 最终证据由首轮 `20260828-112051`、补完轮 `20260828-122122` 与 PR #452 review-fix 新鲜卷重跑共同组成：G1–G7 全 PASS，无产品 FAIL、无新增 Issue。review-fix 补齐 G2 Cartesian、G5 模块双 tab/刷新、G6 Park-B 特异响应、G7 dependency/scope/field/file 安全链，并同步报告权威状态。父任务在 #452 merge 与 main CI/Deploy 双绿后归档，详见 `docs/uat/pam-audit-s15-regression-uat-20260828-122122.md`。
